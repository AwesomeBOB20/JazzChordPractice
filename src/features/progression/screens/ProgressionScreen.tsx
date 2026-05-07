import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Platform, StatusBar as RNStatusBar, TextInput, UIManager, Dimensions, Animated, TouchableWithoutFeedback, PanResponder, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';

import { useSettingsStore } from '@features/settings/store/settingsStore';
import { useChordStore } from '@features/play/store/chordStore';
import { useProgressionStore } from '@features/progression/store/progressionStore';
import { THEMES } from '@shared/ui/themes';
import { NOTE_SHARP, NOTE_FLAT, CH, getChordNotes, getChordIntervals, CHORD_CATEGORIES, CHORD_SCALE_MAP, SCALES, CHORD_PATTERN_MAP, PATTERNS } from '@shared/theory/musicTheory';
import { useAudio } from '@shared/audio/AudioContext';
import { useProgressionPlayer } from '@shared/hooks/useProgressionPlayer';
import { calculateOptimalVoiceLeading, buildHardcodedShapeVoicings } from '@shared/guitar';
import { buildPianoVoicings } from '@shared/piano';

// NOTICE: ProgressionSettings has been completely removed from this import list!
import { ProgressionToolbar, ProgressionPlayerDock, PopUpModal, SlideUpModal, MiniChordDiagram, MiniPianoDiagram, BpmModal } from '@shared/ui';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ROOTS = [0,1,2,3,4,5,6,7,8,9,10,11];

const ProgressionCell = React.memo(function ProgressionCell({ 
  group, gIdx, viewMode, showShapes, instrument, octave,
  selectedCell, playingIdx, 
  handleCellPress, handleCellLongPress, 
  t, diagramShapes, diagramVoicings, pianoShapes, pianoVoicings, 
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
            <Text style={{ position: 'absolute', top: 4, left: 6, fontSize: 9, fontWeight: '700', color: isPlaying ? t.accent : t.txt3, opacity: 0.6, zIndex: 10 }}>{gIdx + 1}</Text>
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
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: txtColor1 }}>{rootText}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: txtColor2, marginTop: 1 }}>{typeText}</Text>
                </View>
                {chord && (
                  <View style={{ marginTop: 2 }}>
                    {instrument === 'piano' ? (
                      <MiniPianoDiagram chord={chord} notes={showShapes ? pianoShapes[idx]?.notes : pianoVoicings[idx]?.notes} showShapes={showShapes} theme={t} octave={octave} />
                    ) : (
                      <MiniChordDiagram voicing={showShapes ? undefined : diagramVoicings[idx]} shape={showShapes ? diagramShapes[idx] : undefined} theme={t} />
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
        style={[styles.cell, { backgroundColor: bgColor, borderColor: borderColor, zIndex: isPlaying ? 10 : isSelected ? 10 : 1, height: cellHeight }, (isSelected || isPlaying) && { margin: 0, borderWidth: 2 }]}
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
      <View style={[styles.cell, { flexBasis: '25%', flexGrow: 1, maxWidth: '26%', backgroundColor: bgColor, borderColor: borderColor, zIndex: isPlaying ? 10 : isSelected ? 10 : 1, height: cellHeight, padding: 0, flexDirection: 'row' }, (isSelected || isPlaying) && { margin: 0, borderWidth: 2 }]}>
          
          {/* Absolute Measure Number */}
          <Text style={{ position: 'absolute', top: 4, left: 6, fontSize: 9, fontWeight: '700', color: isPlaying ? t.accent : t.txt3, opacity: 0.6, zIndex: 10 }}>{gIdx + 1}</Text>

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
                      <View style={{ transform: [{ scale: instrument === 'piano' ? 0.75 : 0.75 }], marginTop: -8, marginBottom: -6 }}>
                        {instrument === 'piano' ? (
                          <MiniPianoDiagram chord={left} notes={showShapes ? pianoShapes[leftIdx]?.notes : pianoVoicings[leftIdx]?.notes} showShapes={showShapes} theme={t} octave={octave} />
                        ) : (
                          <MiniChordDiagram voicing={showShapes ? undefined : diagramVoicings[leftIdx]} shape={showShapes ? diagramShapes[leftIdx] : undefined} theme={t} />
                        )}
                      </View>
                  </View>
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                      {renderSplitText(right, pRight.isPlaying)}
                      <View style={{ transform: [{ scale: instrument === 'piano' ? 0.75 : 0.75 }], marginTop: -8, marginBottom: -6 }}>
                        {instrument === 'piano' ? (
                          <MiniPianoDiagram chord={right} notes={showShapes ? pianoShapes[rightIdx]?.notes : pianoVoicings[rightIdx]?.notes} showShapes={showShapes} theme={t} octave={octave} />
                        ) : (
                          <MiniChordDiagram voicing={showShapes ? undefined : diagramVoicings[rightIdx]} shape={showShapes ? diagramShapes[rightIdx] : undefined} theme={t} />
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
  const { theme, instrument, bpm, setBpm, voiceLeading, fretCap, pianoZone, octave, arp } = useSettingsStore();
  const { rootSemi, chordType, namingMode, resetPulse } = useChordStore();
  const { progression, setProgressionChord, clearProgression, addMeasure, removeMeasure, saveSong, savedSongs, loadSong, deleteSong, guitarNeckZone, setGuitarNeckZone } = useProgressionStore();
  
  const t = THEMES[theme];
  const insets = useSafeAreaInsets();

  const screenHeight = Dimensions.get('window').height;
  const tabBarHeight = 60 + insets.bottom + 4;
  const topInset = insets.top || (Platform.OS === 'android' ? 24 : 0);
  const usableHeight = screenHeight - tabBarHeight - topInset;
  const sheetPixelHeight = Math.round(usableHeight * 0.6);
  
  const [selectedCell, setSelectedCell] = useState<number | null>(0);
  const [viewMode, setViewMode] = useState<'text' | 'diagram'>('text');
  const [showShapes, setShowShapes] = useState(false);
  const lastTap = useRef<{ idx: number, time: number }>({ idx: -1, time: 0 });

  const diagramVoicings = React.useMemo(() => calculateOptimalVoiceLeading(progression, voiceLeading, fretCap, guitarNeckZone), [progression, voiceLeading, fretCap, guitarNeckZone]);

  const pianoVoicings = React.useMemo(() => {
    const result: any[] = [];
    let lastVoicing: number[] | null = null;
    const baseMidi = 60; 
    
    for (let i = 0; i < progression.length; i++) {
      const chord = progression[i];
      if (!chord) { result.push(null); continue; }
      
      const intervals = getChordIntervals(chord.chordType).slice(0, 4);
      let rawNotes = intervals.map((iv: number) => {
        const pc = (chord.rootSemi + iv) % 12;
        let midi = ((octave + 1) * 12) + pc;
        if (midi < ((octave + 1) * 12) + chord.rootSemi) midi += 12;
        return midi;
      });

      if (voiceLeading && lastVoicing) {
        const prevCenter = lastVoicing.reduce((a,b) => a+b, 0) / lastVoicing.length;
        const nextVoicing = rawNotes.map(note => {
          const pc = note % 12;
          let closest = pc + baseMidi;
          let minDiff = 999;
          for (let oct = octave - 1; oct <= octave + 2; oct++) {
            const test = pc + oct * 12;
            const diff = Math.abs(test - prevCenter);
            if (diff < minDiff) { minDiff = diff; closest = test; }
          }
          return closest;
        });
        nextVoicing.sort((a: number, b: number) => a - b);
        if (nextVoicing.length >= 3 && nextVoicing[nextVoicing.length - 2] - 12 >= baseMidi) {
           nextVoicing[nextVoicing.length - 2] -= 12;
           nextVoicing.sort((a: number, b: number) => a - b);
        }
        rawNotes = nextVoicing;
      }
      
      lastVoicing = rawNotes;
      result.push({ notes: rawNotes });
    }
    return result;
  }, [progression, voiceLeading, octave]);

  const pianoShapes = React.useMemo(() => {
    const result: any[] = [];
    const PIANO_ZONE_CENTER = (pianoZone + 1) * 12; 
    
    for (let i = 0; i < progression.length; i++) {
      const chord = progression[i];
      if (!chord) { result.push(null); continue; }
      
      const rootMidi = ((octave + 1) * 12) + chord.rootSemi;
      let baseNotes: number[] = [];

      const shapeDef = CHORD_PATTERN_MAP[chord.chordType]?.[0];
      const pattern = shapeDef ? PATTERNS[shapeDef.pattern] : null;

      if (pattern) {
        baseNotes = pattern.iv.map(iv => rootMidi + shapeDef.offset + iv);
      } else {
        const intervals = getChordIntervals(chord.chordType).slice(0, 4);
        baseNotes = intervals.map(iv => rootMidi + iv);
      }

      if (!voiceLeading) {
        result.push({ notes: baseNotes });
        continue;
      }

      const inversions: number[][] = [];
      let currentInv = [...baseNotes].map(n => n - 24); 
      
      for (let inv = 0; inv < 12; inv++) { 
        inversions.push([...currentInv]);
        let nextInv = [...currentInv];
        nextInv[0] += 12; 
        nextInv.sort((a, b) => a - b);
        currentInv = nextInv;
      }
      
      let bestInv = inversions[0];
      let minDiff = 999;

      for (const inv of inversions) {
        const center = inv.reduce((sum, val) => sum + val, 0) / inv.length;
        const diff = Math.abs(center - PIANO_ZONE_CENTER);
        if (diff < minDiff) {
          minDiff = diff;
          bestInv = inv;
        }
      }

      result.push({ notes: bestInv });
    }
    return result;
  }, [progression, voiceLeading, octave, pianoZone]);

  const diagramShapes = React.useMemo(() => {
    return progression.map((chord, idx) => {
      if (!chord) return null;
      const shapes = buildHardcodedShapeVoicings(chord.chordType, chord.rootSemi, namingMode, true);
      if (!shapes || shapes.length === 0) return null;

      if (guitarNeckZone !== null) {
        let bestShape = shapes[0];
        let minDiff = 999;
        for (const s of shapes) {
          const sFrets = s.notes ? s.notes.filter((n:any) => n.fret > 0).map((n:any) => n.fret) : [];
          const sMin = sFrets.length > 0 ? Math.min(...sFrets) : 0;
          const diff = Math.abs(sMin - guitarNeckZone);
          if (diff < minDiff) { minDiff = diff; bestShape = s; }
        }
        return bestShape;
      }

      if (!voiceLeading) {
        const lowEShape = shapes.find(s => 
          s.notes && s.notes.some((n: any) => n.stringIdx === 0 && (n.role === '1' || n.role === 'R' || n.role === 'root'))
        );
        return lowEShape || shapes[0];
      }

      const activeVoicing = diagramVoicings[idx];
      if (activeVoicing && activeVoicing.frets) {
        const vFrets = activeVoicing.frets.map((f: any) => f?.fret).filter((f: any) => f !== null && f > 0);
        if (vFrets.length > 0) {
          const vMin = Math.min(...vFrets);
          let bestShape = shapes[0];
          let minDiff = 999;
          
          for (const s of shapes) {
            const sFrets = s.notes ? s.notes.filter((n:any) => n.fret > 0).map((n:any) => n.fret) : [];
            const sMin = sFrets.length > 0 ? Math.min(...sFrets) : 0;
            const diff = Math.abs(sMin - vMin);
            if (diff < minDiff) { minDiff = diff; bestShape = s; }
          }
          return bestShape;
        }
      }
      return shapes[0];
    });
  }, [progression, namingMode, diagramVoicings, voiceLeading, guitarNeckZone]);

  const activeDiagrams = showShapes ? diagramShapes : diagramVoicings;
  const audioVoicings = instrument === 'piano' ? (showShapes ? pianoShapes : pianoVoicings) : (showShapes ? diagramShapes : diagramVoicings);
  const { playingIdx, isPlayingSystem, isLooping, toggleLooping, handlePlayProgression, stopPlayback } = useProgressionPlayer(selectedCell, audioVoicings);

  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) {
      stopPlayback();
    }
  }, [isFocused]);

  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false);
  const [isLibModalVisible, setIsLibModalVisible] = useState(false);
  const [songName, setSongName] = useState('');
  const [isBpmModalVisible, setIsBpmModalVisible] = useState(false);

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

  const openDrawer = () => setIsDrawerVisible(true);
  const closeDrawer = () => setIsDrawerVisible(false);
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
      if (isSaveModalVisible) { setIsSaveModalVisible(false); return true; }
      if (isBpmModalVisible) { setIsBpmModalVisible(false); return true; }
      if (isLibModalVisible) { setIsLibModalVisible(false); return true; }
      if (isDrawerVisible || drawerModalVisible) { closeDrawer(); return true; }
      return false; 
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [isSaveModalVisible, isBpmModalVisible, isLibModalVisible, isDrawerVisible, drawerModalVisible]);

  const playSelectedCellAudio = (idx: number, chord: any) => {
    if (!chord) return;
    let notesToPlay = getChordNotes(chord.rootSemi, chord.chordType, octave);
    if (instrument === 'guitar') {
      const GS = [40, 45, 50, 55, 59, 64]; 
      const audioDiagram = (showShapes && arp) ? diagramShapes[idx] : diagramVoicings[idx] as any;
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
      const activePianoVoicing = (showShapes && arp) ? pianoShapes[idx] : pianoVoicings[idx];
      if (activePianoVoicing && activePianoVoicing.notes) {
        notesToPlay = activePianoVoicing.notes;
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
    onPlay(notesToPlay, { guitar: instrument === 'guitar' });
  };

  const handleRootPick = (r: number) => {
    setBrushRoot(r);
    if (selectedCell !== null) setProgressionChord(selectedCell, r, brushType);
    onPlay(getChordNotes(r, brushType, 4), { guitar: instrument === 'guitar' });
  };

  const handleTypePick = (type: string) => {
    setBrushType(type);
    if (selectedCell !== null) setProgressionChord(selectedCell, brushRoot, type);
    onPlay(getChordNotes(brushRoot, type, 4), { guitar: instrument === 'guitar' });
  };

  const handlePrevCell = () => {
    if (selectedCell === null) return;
    const prevIdx = selectedCell === 0 ? progression.length - 1 : selectedCell - 1; 
    setSelectedCell(prevIdx);
    const chord = progression[prevIdx];
    if (chord) { 
      setBrushRoot(chord.rootSemi); setBrushType(chord.chordType); 
      useChordStore.setState({ rootSemi: chord.rootSemi, chordType: chord.chordType });
      playSelectedCellAudio(prevIdx, chord);
    }
  };

  const handleNextCell = () => {
    if (selectedCell === null) return;
    const nextIdx = selectedCell === progression.length - 1 ? 0 : selectedCell + 1; 
    setSelectedCell(nextIdx);
    const chord = progression[nextIdx];
    if (chord) { 
      setBrushRoot(chord.rootSemi); setBrushType(chord.chordType); 
      useChordStore.setState({ rootSemi: chord.rootSemi, chordType: chord.chordType });
      playSelectedCellAudio(nextIdx, chord);
    }
  };

  return (
    <View style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={[styles.card, { 
        backgroundColor: t.bg2, 
        paddingTop: isPlayingSystem ? 0 : 16,
        paddingBottom: isPlayingSystem ? 0 : 14,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
        zIndex: 30
      }]}>
        {!isPlayingSystem && (
          <View style={[styles.measureHeader, { justifyContent: 'space-between', marginBottom: 0 }]}>
            <View style={{ flexDirection: 'row', gap: 8, flex: 1, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {viewMode === 'diagram' && (
                <TouchableOpacity style={[styles.measureBtn, { borderColor: t.border, backgroundColor: t.bg3, width: 'auto', paddingHorizontal: 10, flexDirection: 'row', gap: 4 }]} onPress={() => setShowShapes(s => !s)}>
                  <Ionicons name={showShapes ? 'color-filter' : 'color-filter-outline'} size={14} color={showShapes ? t.accent : t.txt2} />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: showShapes ? t.accent : t.txt2 }}>{showShapes ? 'SHAPES' : 'CHORDS'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.measureBtn, { borderColor: t.border, backgroundColor: t.bg3, width: 'auto', paddingHorizontal: 10, flexDirection: 'row', gap: 4 }]} onPress={() => setViewMode(v => v === 'text' ? 'diagram' : 'text')}>
                <Ionicons name={viewMode === 'text' ? 'grid-outline' : 'text-outline'} size={14} color={t.txt2} />
                <Text style={{ fontSize: 10, fontWeight: '800', color: t.txt2 }}>{viewMode === 'text' ? 'DIAGRAMS' : 'TEXT'}</Text>
              </TouchableOpacity>
              
              {instrument === 'guitar' && (
                <View style={{ flexDirection: 'row', backgroundColor: t.bg3, borderRadius: 18, borderWidth: 1, borderColor: t.border, overflow: 'hidden', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => setGuitarNeckZone(guitarNeckZone === null ? 12 : (guitarNeckZone <= 1 ? null : guitarNeckZone - 1))} style={{ height: 34, width: 30, justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderColor: t.border }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: t.txt2 }}>-</Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center', minWidth: 36 }}>
                    <Text style={{ fontSize: 8, fontWeight: '800', color: t.txt3 }}>ZONE</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: t.txt1 }}>{guitarNeckZone === null ? 'AUTO' : guitarNeckZone}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setGuitarNeckZone(guitarNeckZone === null ? 1 : (guitarNeckZone >= 12 ? null : guitarNeckZone + 1))} style={{ height: 34, width: 30, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1, borderColor: t.border }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: t.txt2 }}>+</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
              <TouchableOpacity style={[styles.measureBtn, { borderColor: t.border, backgroundColor: t.bg3 }]} onPress={() => {
                removeMeasure(selectedCell);
                if (selectedCell !== null && selectedCell >= progression.length - 1) setSelectedCell(Math.max(0, progression.length - 2));
              }}>
                <Ionicons name="remove" size={18} color={t.txt3} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.measureBtn, { borderColor: t.border, backgroundColor: t.bg3 }]} onPress={() => {
                addMeasure(selectedCell);
                if (selectedCell !== null) {
                  setSelectedCell(selectedCell + 1);
                }
              }}>
                <Ionicons name="add" size={18} color={t.txt3} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
      <ScrollView ref={scrollRef} style={{ zIndex: 20 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} removeClippedSubviews={true}>
        <View style={[styles.card, { backgroundColor: t.bg2, paddingTop: 0 }]}>
          
          <View style={[styles.grid, { borderTopColor: t.border, borderBottomColor: t.border }]}>
            {groupedCells.map((group, gIdx) => {
              const getCellProps = (idx: number) => {
                const isSelected = selectedCell === idx;
                const isPlaying = playingIdx === idx;
                let bgColor = t.bg3;
                let borderColor = t.border;
                if (isSelected) { borderColor = t.accent; bgColor = t.bg2; }
                if (isPlaying) { bgColor = t.bg2; borderColor = t.accent; }
                return { isSelected, isPlaying, bgColor, borderColor };
              };

              const handleCellPress = (idx: number, chord: any) => {
                const now = Date.now();
                const isDoubleTap = lastTap.current.idx === idx && (now - lastTap.current.time < 300);
                if (isDoubleTap) {
                  lastTap.current = { idx: -1, time: 0 };
                  setSelectedCell(idx);
                  if (!isDrawerVisible) openDrawer();
                } else {
                  lastTap.current = { idx, time: now };
                  setSelectedCell(selectedCell === idx ? null : idx);
                  if (chord) {
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
                if (chord) {
                  setBrushRoot(chord.rootSemi); setBrushType(chord.chordType);
                  useChordStore.setState({ rootSemi: chord.rootSemi, chordType: chord.chordType });
                  playSelectedCellAudio(idx, chord);
                }
                if (!isDrawerVisible) openDrawer();
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
                        <Text style={{ position: 'absolute', top: 4, left: 6, fontSize: 9, fontWeight: '700', color: isPlaying ? t.accent : t.txt3, opacity: 0.6, zIndex: 10 }}>{gIdx + 1}</Text>
                      )}
                      
                      {/* Left Zone: Time Sig, Start Repeat */}
                      <View style={viewMode === 'diagram' ? { position: 'absolute', left: 4, bottom: 4, zIndex: 2 } : { alignItems: 'flex-start', justifyContent: 'flex-end', paddingBottom: 2, paddingLeft: 4, height: '100%', zIndex: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                          {!isRightHalf && showTimeSig && (
                            <View style={{ alignItems: 'center', marginRight: 2, marginBottom: 2 }}>
                              <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 11, fontWeight: 'bold', color: t.accent, lineHeight: 10 }}>{topNum}</Text>
                              <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Times New Roman' : 'serif', fontSize: 11, fontWeight: 'bold', color: t.accent, lineHeight: 10 }}>4</Text>
                            </View>
                          )}
                          {!!chord?.repeatStart && ( <Text style={{ fontSize: 16, color: t.accent, fontWeight: '800', marginBottom: 1 }}>𝄆</Text> )}
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
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: txtColor1 }}>{rootText}</Text>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: txtColor2, marginTop: 1 }}>{typeText}</Text>
                            </View>
                            {chord && (
                              <View style={{ marginTop: 2 }}>
                                {instrument === 'piano' ? (
                                  <MiniPianoDiagram chord={chord} notes={showShapes ? pianoShapes[idx]?.notes : pianoVoicings[idx]?.notes} showShapes={showShapes} theme={t} octave={octave} />
                                ) : (
                                  <MiniChordDiagram voicing={showShapes ? undefined : diagramVoicings[idx]} shape={showShapes ? diagramShapes[idx] : undefined} theme={t} />
                                )}
                              </View>
                            )}
                          </View>
                        )}
                      </View>

                      {/* Right Zone: End Repeat */}
                      <View style={viewMode === 'diagram' ? { position: 'absolute', right: 4, bottom: 4, zIndex: 2 } : { alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 2, paddingRight: 4, height: '100%', zIndex: 2 }}>
                        {!!chord?.repeatEnd && ( <Text style={{ fontSize: 16, color: t.accent, fontWeight: '800', marginBottom: 1 }}>𝄇</Text> )}
                      </View>

                    </View>
                  );
              };

              const cellHeight = viewMode === 'diagram' ? 130 : 60;

              if (group.type === 'single') {
                const { idx, chord } = group;
                const { isSelected, isPlaying, bgColor, borderColor } = getCellProps(idx);
                return (
                  <TouchableOpacity key={`cell-${idx}`} activeOpacity={0.7}
                    style={[styles.cell, { backgroundColor: bgColor, borderColor: borderColor, zIndex: isPlaying ? 10 : isSelected ? 10 : 1, height: cellHeight }, (isSelected || isPlaying) && { margin: 0, borderWidth: 2 }]}
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
                  <View key={`split-${leftIdx}`} style={[styles.cell, { flexBasis: '25%', flexGrow: 1, maxWidth: '26%', backgroundColor: bgColor, borderColor: borderColor, zIndex: isPlaying ? 10 : isSelected ? 10 : 1, height: cellHeight, padding: 0, flexDirection: 'row' }, (isSelected || isPlaying) && { margin: 0, borderWidth: 2 }]}>
                     
                     {/* Absolute Measure Number */}
                     <Text style={{ position: 'absolute', top: 4, left: 6, fontSize: 9, fontWeight: '700', color: isPlaying ? t.accent : t.txt3, opacity: 0.6, zIndex: 10 }}>{gIdx + 1}</Text>

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
                                 <View style={{ transform: [{ scale: instrument === 'piano' ? 0.75 : 0.75 }], marginTop: -8, marginBottom: -6 }}>
                                   {instrument === 'piano' ? (
                                     <MiniPianoDiagram chord={left} notes={showShapes ? pianoShapes[leftIdx]?.notes : pianoVoicings[leftIdx]?.notes} showShapes={showShapes} theme={t} octave={octave} />
                                   ) : (
                                     <MiniChordDiagram voicing={showShapes ? undefined : diagramVoicings[leftIdx]} shape={showShapes ? diagramShapes[leftIdx] : undefined} theme={t} />
                                   )}
                                 </View>
                              </View>
                              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                                 {renderSplitText(right, pRight.isPlaying)}
                                 <View style={{ transform: [{ scale: instrument === 'piano' ? 0.75 : 0.75 }], marginTop: -8, marginBottom: -6 }}>
                                   {instrument === 'piano' ? (
                                     <MiniPianoDiagram chord={right} notes={showShapes ? pianoShapes[rightIdx]?.notes : pianoVoicings[rightIdx]?.notes} showShapes={showShapes} theme={t} octave={octave} />
                                   ) : (
                                     <MiniChordDiagram voicing={showShapes ? undefined : diagramVoicings[rightIdx]} shape={showShapes ? diagramShapes[rightIdx] : undefined} theme={t} />
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
            })}
          </View>
          
        </View>

      </ScrollView>

      <View style={{ backgroundColor: t.bg2 }}>
        {!isPlayingSystem && <ProgressionToolbar selectedCell={selectedCell} />}
      </View>

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
                                <Text style={{ fontWeight: '700', fontSize: 14, color: isActive ? '#fff' : t.txt2 }}>{String(CH[key]?.l ?? '')}</Text>
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
          <TextInput style={[styles.textInput, { backgroundColor: t.bg, color: t.txt1, borderColor: t.border }]} placeholder="e.g. Autumn Leaves" placeholderTextColor={t.txt3} value={songName} onChangeText={setSongName} autoFocus />
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
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {savedSongs.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={{ marginBottom: 12, opacity: 0.5 }}><Ionicons name="musical-notes-outline" size={48} color={t.txt3} /></View>
                <Text style={[styles.emptyStateTitle, { color: t.txt1 }]}>No Saved Songs</Text>
                <Text style={[styles.emptyStateSub, { color: t.txt3 }]}>Save a progression to access it here.</Text>
              </View>
            ) : (
              savedSongs.map((song: any) => (
                <TouchableOpacity key={song.id} style={[styles.songCard, { backgroundColor: t.bg2, borderColor: t.border }]} onPress={() => { stopPlayback(); loadSong(song.id); setIsLibModalVisible(false); setSelectedCell(0); }} activeOpacity={0.7}>
                  <View style={[styles.songCardIcon, { backgroundColor: t.bg3, borderColor: t.border }]}><Ionicons name="play" size={20} color={t.accent} /></View>
                  <View style={{ flex: 1, paddingHorizontal: 12 }}>
                    <Text style={{ color: t.txt1, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>{song.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="timer-outline" size={12} color={t.txt3} /><Text style={{ color: t.txt3, fontSize: 12, fontWeight: '600' }}>{song.bpm} BPM</Text></View>
                  </View>
                  <TouchableOpacity onPress={() => deleteSong(song.id)} style={styles.deleteBtn}><Ionicons name="trash-outline" size={20} color={t.accent} /></TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </SlideUpModal>

      <BpmModal visible={isBpmModalVisible} onClose={() => setIsBpmModalVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 32 },
  card: { paddingTop: 16, paddingBottom: 0 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14, paddingHorizontal: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 0, borderTopWidth: 1, borderBottomWidth: 1 },
  cell: { flexBasis: '25%', flexGrow: 1, maxWidth: '26%', flexShrink: 0, height: 60, borderWidth: 1, marginTop: -1, marginLeft: -1, alignItems: 'center', justifyContent: 'center', padding: 2, position: 'relative' },
  measureNum: { position: 'absolute', top: 4, left: 6, fontSize: 9, fontWeight: '700' },
  repeatSign: { position: 'absolute', bottom: 2, fontSize: 18, fontWeight: '900', lineHeight: 20 },
  cellRoot: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  cellType: { fontSize: 11, fontWeight: '700' },
  beatsBadge: { position: 'absolute', top: 2, right: 3, borderRadius: 6, paddingHorizontal: 3, height: 12, alignItems: 'center', justifyContent: 'center' },
  measureHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 14 },
  measureBtn: { height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minWidth: 36 },
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