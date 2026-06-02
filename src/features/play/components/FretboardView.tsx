import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Svg, { Line, Circle, Text as SvgText, Rect, Path } from 'react-native-svg';
import { Theme } from '@shared/ui/themes';
import { Voicing, VoicingGroup, ScaleVoicing } from '@shared/guitar';
import { CH, spellInterval, formatDegree, SCALES, NOTE_FLAT, NOTE_SHARP, ROLE_SHORT, getGlobalLabel } from '@shared/theory/musicTheory';
import { ROLE_COLORS_GLOBAL, getNoteColor } from '@shared/ui/themes';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { formatChordSymbol } from '@shared/theory/core/nomenclature';

export interface FretboardViewRef {
  flashMidi: (midi: number) => void;
  flashAll: (midiNotes: number[]) => void;
  nextVoicing: () => void;
  prevVoicing: () => void;
}

interface Props {
  groups: VoicingGroup[];
  theme: Theme;
  onNotePress?: (midi: number) => void;
  onPlayVoicing?: (midiNotes: number[], voicingName: string, activeRoles?: string[], activeIvs?: number[], spelledNames?: string[], activeFormula?: string[]) => void;
  onNavigate?: () => void;
  rootSemi: number;
  chordName?: string;
  chordType?: string;
  triggerFlash?: number;
  labelMode?: 'degrees' | 'notes' | 'none';
  scaleVoicings?: ScaleVoicing[];
  scaleMode?: boolean;
  formulaByPC?: Record<number, string>;
  defaultGroupIdx?: number;
  arpMode?: boolean;
  arpVoicings?: ScaleVoicing[];
  arpSubsets?: { label: string; subLabel: string; roles?: string[]; ivs?: number[]; formulaLabels?: string[] }[]; 
  arpSubsetIdx?: number;
  onArpSubsetChange?: (idx: number) => void;
  shapesMode?: boolean;
  shapeVoicings?: ScaleVoicing[];
  header?: React.ReactNode;
  namingMode?: 'sharp' | 'flat';
  selectedBoxName?: string | null;
  selectedScaleId?: string | null;
  onBoxChange?: (boxName: string) => void;
  onScaleChange?: (scaleId: string) => void;
  scaleOverlay?: boolean;
  overlayNotes?: any[];
  parentScales?: string[];
  activeParentScale?: string | null;
  onParentScaleChange?: (scaleId: string) => void;
  hideNavigators?: boolean;
  colorModeOverride?: 'theme' | 'roles' | 'selective';
}

const STRUCTURAL_RANK: Record<string, number> = {
  'root': 0, 'R': 0, '1': 0,
  'b2': 1, '2': 2, '#2': 3, '2nd': 2,
  'b3': 4, '3': 5, '3rd': 5,
  '4': 6, '#4': 7, '4th': 6,
  'b5': 8, '5': 9, '#5': 10, '5th': 9,
  'b6': 11, '6': 12, '6th': 12,
  'bb7': 13, 'b7': 14, '7': 15, '7th': 15,
  'b9': 16, '9': 17, '#9': 18, '9th': 17,
  '11': 19, '#11': 20, '11th': 19,
  'b13': 21, '13': 22, '#13': 23, '13th': 22
};

const getRank = (item: any) => {
  if (item.formula && STRUCTURAL_RANK[item.formula] !== undefined) return STRUCTURAL_RANK[item.formula];
  if (item.role && STRUCTURAL_RANK[item.role] !== undefined) return STRUCTURAL_RANK[item.role];
  return item.iv;
};

const GS_MIDI = [40, 45, 50, 55, 59, 64];
const STRING_LABELS = ['E','A','D','G','B','E'];
const STR_SPACING = 46;
const FRET_SPACING = 36;
const MARGIN_LEFT = 72;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 32;
const DOT_R = 14;

const FretboardNote = React.memo(function FretboardNote({ cx, cy, color, textColor, borderColor, openColor, label, isActive, flashAnim, onNotePress, isOpen, bg, isGhost, isRootProp, viewportShift }: any) {
  const pos = React.useRef(new Animated.ValueXY({ x: cx, y: cy })).current;
  const animState = React.useRef(new Animated.Value(0)).current;
  const isFirst = React.useRef(true);
  const lastViewport = React.useRef(viewportShift);
  
  // Track last known visuals for smooth exit animations
  const lastVisuals = React.useRef({ cx, cy, color, textColor, borderColor, openColor, label, isOpen, bg, isRootProp });
  if (isActive) lastVisuals.current = { cx, cy, color, textColor, borderColor, openColor, label, isOpen, bg, isRootProp };
  const visual = isActive ? { cx, cy, color, textColor, borderColor, openColor, label, isOpen, bg, isRootProp } : lastVisuals.current;
  
  // iRealPro Style: Roots are squares, everything else is a circle
  const isRoot = visual.isRootProp !== undefined ? visual.isRootProp : (visual.label === 'R' || visual.label === '1');

  React.useEffect(() => {
    if (isFirst.current) {
      pos.setValue({ x: visual.cx, y: visual.cy });
      isFirst.current = false;
    } else {
      // Gracefully slide the notes even when the viewport shifts. 
      // Removing the hard snap creates a much smoother transition.
      Animated.spring(pos, { 
        toValue: { x: visual.cx, y: visual.cy }, 
        friction: 8, 
        tension: 65, // Lower tension = smoother glide, less jitter
        useNativeDriver: true 
      }).start();
      lastViewport.current = viewportShift;
    }
  }, [visual.cx, visual.cy, viewportShift]);

  React.useEffect(() => {
    // Switching from spring to timing for entrance/exit animations
    // stops the aggressive bouncing that looks like "glitching"
    Animated.timing(animState, { 
      toValue: isActive ? 1 : 0, 
      duration: 200,
      useNativeDriver: true 
    }).start();
  }, [isActive]);

  return (
    <Animated.View 
      pointerEvents={isActive ? 'auto' : 'none'} 
      style={{
        position: 'absolute', 
        left: -DOT_R, 
        top: -DOT_R, 
        width: DOT_R * 2, 
        height: DOT_R * 2,
        borderRadius: isRoot && !visual.isOpen ? 4 : DOT_R, 
        backgroundColor: visual.isOpen ? 'transparent' : visual.color,
        borderWidth: visual.isOpen ? 2 : (visual.borderColor && visual.borderColor !== 'transparent' ? 1 : 0),
        borderColor: visual.isOpen ? (visual.openColor || visual.color) : (visual.borderColor || 'transparent'),
        // extrapolate: 'clamp' PREVENTS the opacity from exploding past 1.0 on overshoots
        opacity: animState.interpolate({ 
          inputRange: [0, 0.5, 1], 
          outputRange: [0, isGhost ? 0.3 : 1, isGhost ? 0.3 : 1],
          extrapolate: 'clamp'
        }),
        transform: [
                { translateX: pos.x }, 
                { translateY: pos.y }, 
                { scale: animState }, 
                { scale: flashAnim }
              ],
              shadowColor: visual.isOpen ? 'transparent' : '#000', 
              shadowOffset: {width: 0, height: 2}, 
              shadowOpacity: visual.isOpen ? 0 : 0.25, 
              shadowRadius: visual.isOpen ? 0 : 3, 
              elevation: visual.isOpen ? 0 : 4,
            }}
          >
      <TouchableOpacity 
        style={StyleSheet.absoluteFillObject} 
        onPress={onNotePress} 
        activeOpacity={0.8} 
        hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: visual.isOpen ? (visual.openColor || visual.color) : (visual.textColor || '#fff'), fontSize: 13, fontWeight: 'bold' }}>{visual.label}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const FretboardMiniMap = React.memo(function FretboardMiniMap({ minFret, maxFret, theme }: { minFret: number, maxFret: number, theme: any }) {
  const TOTAL_FRETS = 24;
  const MAP_W = 320;
  const MAP_H = 32;
  const fretW = MAP_W / TOTAL_FRETS;

  const startF = minFret <= 1 ? 0 : minFret - 1;
  const numF = Math.max(5, maxFret - startF + 1);

  const boxLeft = startF * fretW;
  const boxWidth = Math.min(MAP_W - boxLeft, numF * fretW);

  const MARKERS = [3, 5, 7, 9, 15, 17, 19, 21];

  const isLeftEdge = boxLeft <= 1;
  const isRightEdge = boxLeft + boxWidth >= MAP_W - 1;
  const R = 8;
  const bw = Math.max(1, boxWidth);
  const rtl = isLeftEdge ? R : 0;
  const rtr = isRightEdge ? R : 0;
  const rbr = isRightEdge ? R : 0;
  const rbl = isLeftEdge ? R : 0;

  const buildRoundedRect = (x: number, y: number, w: number, h: number, rtl: number, rtr: number, rbr: number, rbl: number) => {
    const maxR = Math.min(w / 2, h / 2);
    const tl = Math.min(rtl, maxR);
    const tr = Math.min(rtr, maxR);
    const br = Math.min(rbr, maxR);
    const bl = Math.min(rbl, maxR);
    let d = `M ${x + tl} ${y}`;
    d += tr > 0 ? ` L ${x + w - tr} ${y} A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : ` L ${x + w} ${y}`;
    d += br > 0 ? ` L ${x + w} ${y + h - br} A ${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : ` L ${x + w} ${y + h}`;
    d += bl > 0 ? ` L ${x + bl} ${y + h} A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : ` L ${x} ${y + h}`;
    d += tl > 0 ? ` L ${x} ${y + tl} A ${tl} ${tl} 0 0 1 ${x + tl} ${y}` : ` L ${x} ${y}`;
    d += ' Z';
    return d;
  };

  const fillPath = buildRoundedRect(boxLeft, 0, bw, MAP_H, rtl, rtr, rbr, rbl);
  const innerPath = buildRoundedRect(
    boxLeft + 2, 2,
    Math.max(1, bw - 4), MAP_H - 4,
    Math.max(0, rtl - 2), Math.max(0, rtr - 2), Math.max(0, rbr - 2), Math.max(0, rbl - 2)
  );
  const borderFrameD = fillPath + ' ' + innerPath;

  return (
    <View style={{ alignSelf: 'center', width: MAP_W, height: MAP_H, backgroundColor: theme.bg3, borderRadius: 8, marginTop: 12, marginBottom: 12 }}>
      <Svg width={MAP_W} height={MAP_H}>
        {/* Container border drawn inside SVG so overflow:hidden doesn't clip content */}
        <Rect x={0.5} y={0.5} width={MAP_W - 1} height={MAP_H - 1} rx={8} ry={8} fill="none" stroke={theme.border} strokeWidth={1} />

        {/* Internal String Lines to read natively as a guitar neck */}
        <Line x1={0} y1={MAP_H * 0.2} x2={MAP_W} y2={MAP_H * 0.2} stroke={theme.border} strokeWidth={0.5} opacity={0.6} />
        <Line x1={0} y1={MAP_H * 0.4} x2={MAP_W} y2={MAP_H * 0.4} stroke={theme.border} strokeWidth={0.5} opacity={0.6} />
        <Line x1={0} y1={MAP_H * 0.6} x2={MAP_W} y2={MAP_H * 0.6} stroke={theme.border} strokeWidth={0.5} opacity={0.6} />
        <Line x1={0} y1={MAP_H * 0.8} x2={MAP_W} y2={MAP_H * 0.8} stroke={theme.border} strokeWidth={0.5} opacity={0.6} />

        {/* Fret Dividers */}
        {Array.from({ length: TOTAL_FRETS - 1 }).map((_, i) => (
          <Line key={`mf-${i}`} x1={(i + 1) * fretW} y1={0} x2={(i + 1) * fretW} y2={MAP_H} stroke={theme.border} strokeWidth={1} opacity={0.8} />
        ))}

        {/* Prominent Inlay Markers */}
        {MARKERS.map(m => (
          <Circle key={`mm-${m}`} cx={(m - 0.5) * fretW} cy={MAP_H / 2} r={2} fill={theme.txt3} opacity={0.9} />
        ))}
        {[12, 24].map(m => (
          <React.Fragment key={`mm-double-${m}`}>
            <Circle cx={(m - 0.5) * fretW} cy={MAP_H * 0.25} r={1.5} fill={theme.txt3} opacity={0.9} />
            <Circle cx={(m - 0.5) * fretW} cy={MAP_H * 0.75} r={1.5} fill={theme.txt3} opacity={0.9} />
          </React.Fragment>
        ))}

        {/* Highlight fill — edge to edge, no gaps at corners */}
        <Path d={fillPath} fill={theme.accent} fillOpacity={0.3} />

        {/* Highlight border frame — solid 2px accent with evenodd fill rule */}
        <Path d={borderFrameD} fill={theme.accent} fillRule="evenodd" />
      </Svg>
    </View>
  );
});

const ScaleDiagram = React.memo(function ScaleDiagram({ scaleVoicing, theme, rootSemi, namingMode, onNotePress, labelMode = 'degrees', imperativeFlashRef, scaleOverlay, overlayNotes = [] }: any) {
  const { notes, minFret, maxFret } = scaleVoicing;
  const storeColorMode = useSettingsStore((s: any) => s.colorMode);
  const colorMode = useSettingsStore((s: any) => s.colorMode);
  const flashAnims = React.useRef<Record<string, Animated.Value>>({});
  const getFlashAnim = (key: string) => {
    if (!flashAnims.current[key]) { flashAnims.current[key] = new Animated.Value(1); }
    return flashAnims.current[key];
  };
  const flashDot = (key: string) => {
    const anim = getFlashAnim(key);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.35, duration: 80, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  };
  if (imperativeFlashRef) {
    imperativeFlashRef.current = (midi: number) => {
      // Prefer exact physical MIDI match first
      let matches = notes.filter((n: any) => GS_MIDI[n.stringIdx] + n.fret === midi);
      
      // Fallback for theoretically spread-out arpeggios where exact octave might not exist in the box
      if (matches.length === 0) {
        const pcMatches = notes.filter((n: any) => (GS_MIDI[n.stringIdx] + n.fret) % 12 === midi % 12);
        if (pcMatches.length > 0) {
          // Find the closest physical note to the theoretical MIDI to flash just one dot
          pcMatches.sort((a: any, b: any) => {
            const distA = Math.abs((GS_MIDI[a.stringIdx] + a.fret) - midi);
            const distB = Math.abs((GS_MIDI[b.stringIdx] + b.fret) - midi);
            return distA - distB;
          });
          matches = [pcMatches[0]];
        }
      }

      // Only flash one individual note at a time
      if (matches.length > 0) {
        const match = matches[0];
        flashDot(`${match.stringIdx}-${match.fret}`);
      }
    };
  }

  // Anchor to the nut only for a genuine open-position box (low fretted notes). A box
  // shifted up the neck still shows its open strings above the nut, but its fretted
  // notes are windowed with a starting-fret label instead of a long empty neck.
  const hasOpenString = notes.some((n: any) => n.fret === 0);
  const isOpenPosition = minFret <= 1;
  const showOpenStrings = isOpenPosition || hasOpenString;
  const startFret = isOpenPosition ? 0 : minFret - 1;
  const NUM_FRETS = Math.max(5, maxFret - startFret + 1);
  const numDisplayStrings = 6;
  const fretNum = startFret + 1;
  const fretSuffix = fretNum === 1 ? 'st' : fretNum === 2 ? 'nd' : fretNum === 3 ? 'rd' : 'th';
  const fretLabel = isOpenPosition ? '' : `${fretNum}${fretSuffix}`;
  const SVG_W = MARGIN_LEFT + STR_SPACING * (numDisplayStrings - 1) + MARGIN_LEFT;
  const SVG_H = MARGIN_TOP + FRET_SPACING * NUM_FRETS + MARGIN_BOTTOM;

  return (
    <View style={{ alignItems: 'center' }}>
      <FretboardMiniMap minFret={isOpenPosition ? 1 : minFret} maxFret={maxFret} theme={theme} />
      <View style={[styles.diagramWrap, { width: SVG_W, height: SVG_H }]}>
        <Svg width={SVG_W} height={SVG_H} style={{ position: 'absolute', top: 0, left: 0 }}>
          {isOpenPosition && ( <Rect x={MARGIN_LEFT - 1.25} y={MARGIN_TOP - 5} width={STR_SPACING * (numDisplayStrings - 1) + 1.75} height={5} fill={theme.txt1} /> )}
        {!isOpenPosition && ( <SvgText x={MARGIN_LEFT - 20} y={MARGIN_TOP + FRET_SPACING * 0.6} fontSize={14} fill={theme.txt2} textAnchor="end" fontWeight="700">{fretLabel}</SvgText> )}
        {Array.from({ length: NUM_FRETS + 1 }).map((_, fi) => ( <Line key={`fret-${fi}`} x1={MARGIN_LEFT} y1={MARGIN_TOP + fi * FRET_SPACING} x2={MARGIN_LEFT + STR_SPACING * (numDisplayStrings - 1)} y2={MARGIN_TOP + fi * FRET_SPACING} stroke={theme.border} strokeWidth={1} /> ))}
        {[0,1,2,3,4,5].map((strIdx, displayPos) => {
          const x = MARGIN_LEFT + displayPos * STR_SPACING;
          const thickness = 2.5 - strIdx * 0.3;
          return ( <Line key={`str-${strIdx}`} x1={x} y1={MARGIN_TOP} x2={x} y2={MARGIN_TOP + FRET_SPACING * NUM_FRETS} stroke={theme.txt2} strokeWidth={Math.max(0.5, thickness)} /> );
        })}
        {[3,5,7,9,15,17,19,21].map(fn => {
          const rel = fn - startFret;
          if (rel < 1 || rel > NUM_FRETS) return null;
          return ( <Circle key={`marker-${fn}`} cx={MARGIN_LEFT + STR_SPACING * (numDisplayStrings - 1) / 2} cy={MARGIN_TOP + (rel - 0.5) * FRET_SPACING} r={3} fill={theme.border} /> );
        })}
        {[12, 24].map(fn => {
          const rel = fn - startFret;
          if (rel < 1 || rel > NUM_FRETS) return null;
          return (
            <React.Fragment key={`marker-${fn}`}>
              <Circle cx={MARGIN_LEFT + STR_SPACING * ((numDisplayStrings - 1) / 2 - 1)} cy={MARGIN_TOP + (rel - 0.5) * FRET_SPACING} r={3} fill={theme.border} />
              <Circle cx={MARGIN_LEFT + STR_SPACING * ((numDisplayStrings - 1) / 2 + 1)} cy={MARGIN_TOP + (rel - 0.5) * FRET_SPACING} r={3} fill={theme.border} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, width: SVG_W, height: SVG_H }}>
        {/* Ghost Scale Dots */}
        {scaleOverlay && (() => {
          const seen = new Set();
          return overlayNotes.filter((note: any) => {
            const key = `${note.stringIdx}-${note.fret}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }).map((note: any) => {
            const { stringIdx, fret, role, formula, noteName } = note;
            
            // CORRECT CLIPPING LOGIC
            if (fret < 0) return null;
            if (fret === 0 && !showOpenStrings) return null;
            if (fret > 0 && (fret <= startFret || fret > startFret + NUM_FRETS)) return null;
            
            const isOccupied = notes.some((n: any) => n.stringIdx === stringIdx && n.fret === fret);
            if (isOccupied) return null;
            
            const colorKey = formula || role;
            const normKey = colorKey === '1' ? 'R' : colorKey;
            const normRole = role === '1' ? 'R' : role;
            const isRoot = normRole === 'R' || normKey === 'R' || formula === '1';
            
            const selectiveRoles = useSettingsStore.getState().selectiveRoles;
            const resolvedColor = getNoteColor(normKey, colorMode, theme, selectiveRoles);
            
            let color, textColor, borderColor, openColor;
            if (colorMode === 'theme') {
              color = theme.accent; 
              textColor = '#fff'; 
              borderColor = 'transparent'; 
              openColor = theme.accent;
            } else if (colorMode === 'selective') {
              color = resolvedColor;
              textColor = resolvedColor === theme.mutedNote ? theme.txt1 : '#fff';
              borderColor = resolvedColor === theme.mutedNote ? theme.border : 'transparent';
              openColor = resolvedColor === theme.mutedNote ? theme.txt2 : resolvedColor;
            } else {
              const roleColor = ROLE_COLORS_GLOBAL[normKey] ?? ROLE_COLORS_GLOBAL[normRole];
              if (roleColor) {
                color = roleColor; textColor = '#fff'; borderColor = 'transparent'; openColor = color;
              } else {
                color = theme.mutedNote; textColor = theme.txt1; borderColor = theme.border; openColor = theme.txt2;
              }
            }

            const midi = GS_MIDI[stringIdx] + fret;
            const label = getGlobalLabel(labelMode, namingMode, rootSemi, formula, role, midi, noteName);
            const cx = MARGIN_LEFT + stringIdx * STR_SPACING;
            const adjustedFret = fret === 0 ? 0 : fret - startFret;
            const cy = fret === 0 ? MARGIN_TOP - 20 : MARGIN_TOP + (adjustedFret - 0.5) * FRET_SPACING;
            const stableKey = `ghost-${stringIdx}-${fret}`;
            const dotKey = `${stringIdx}-${fret}`; // ADDED

            return (
              <FretboardNote 
                key={stableKey} 
                viewportShift={startFret}
                cx={cx} 
                cy={cy}
                color={color} 
                textColor={textColor}
                borderColor={borderColor}
                openColor={openColor}
                label={label} 
                isActive={true}
                isOpen={fret === 0}
                bg="transparent"
                isGhost={true}
                isRootProp={isRoot}
                flashAnim={getFlashAnim(dotKey)} 
                onNotePress={() => { flashDot(dotKey); onNotePress?.(midi); }} 
              />
            );
          });
        })()}

        {notes.map((note: any) => {
          const { stringIdx, fret, role, formula, noteName } = note;
          const colorKey = formula || role;
          const normKey = colorKey === '1' ? 'R' : colorKey;
          const normRole = role === '1' ? 'R' : role;
          const isRoot = normRole === 'R' || normKey === 'R' || formula === '1';
          
          const effectiveFormula = formula || role;
          const selectiveRoles = useSettingsStore.getState().selectiveRoles;
          const resolvedColor = getNoteColor(normKey, colorMode, theme, selectiveRoles);

          let color, textColor, borderColor, openColor;
          if (colorMode === 'theme') {
            color = theme.accent; 
            textColor = '#fff'; 
            borderColor = 'transparent'; 
            openColor = theme.accent;
          } else if (colorMode === 'selective') {
            color = resolvedColor;
            textColor = resolvedColor === theme.mutedNote ? theme.txt1 : '#fff';
            borderColor = resolvedColor === theme.mutedNote ? theme.border : 'transparent';
            openColor = resolvedColor === theme.mutedNote ? theme.txt2 : resolvedColor;
          } else {
            const roleColor = ROLE_COLORS_GLOBAL[normKey] ?? ROLE_COLORS_GLOBAL[normRole];
            if (roleColor) {
              color = roleColor; textColor = '#fff'; borderColor = 'transparent'; openColor = color;
            } else {
              color = theme.bg3; textColor = theme.txt1; borderColor = theme.border; openColor = theme.txt2;
            }
          }
              const midi = GS_MIDI[stringIdx] + fret;
              const label = getGlobalLabel(labelMode, namingMode, rootSemi, formula, role, midi, noteName);
              const cx = MARGIN_LEFT + stringIdx * STR_SPACING;
          const adjustedFret = fret === 0 ? 0 : fret - startFret;
          const cy = fret === 0 ? MARGIN_TOP - 20 : MARGIN_TOP + (adjustedFret - 0.5) * FRET_SPACING;
          
          const dotKey = `${stringIdx}-${fret}`;
          const stableKey = `scale-${stringIdx}-${fret}`;
          // Force visibility if it is an open string regardless of the viewport
          const isVisible = fret === 0 || (fret >= startFret && fret <= startFret + NUM_FRETS);

          if (fret < 0) return null;

          return (
            <FretboardNote 
              key={stableKey} 
              viewportShift={startFret}
              cx={cx} 
              cy={cy}
              color={color} 
              textColor={textColor}
              borderColor={borderColor}
              openColor={openColor}
              label={label} 
              isActive={isVisible}
              isOpen={fret === 0}
              bg={theme.bg2}
              isRootProp={isRoot}
              flashAnim={getFlashAnim(dotKey)} 
              onNotePress={() => { flashDot(dotKey); onNotePress?.(midi); }} 
            />
          );
        })}
      </View>
    </View>
    </View>
  );
});

const FretboardDiagram = React.memo(function FretboardDiagram({ voicing, theme, rootSemi, onNotePress, triggerFlash, labelMode = 'degrees', formulaByPC = {}, imperativeFlashRef, namingMode, overlayNotes = [], colorModeOverride }: any) {
  const storeColorMode = useSettingsStore((s: any) => s.colorMode);
  const colorMode = colorModeOverride || storeColorMode;
  
  // MOVED HOOKS UP: Hooks must always execute before any early returns!
  const flashAnims = React.useRef<Record<string, Animated.Value>>({});
  const getFlashAnim = (key: string) => {
    if (!flashAnims.current[key]) { flashAnims.current[key] = new Animated.Value(1); }
    return flashAnims.current[key];
  };
  const entranceAnim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => { entranceAnim.setValue(0); Animated.spring(entranceAnim, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start(); }, [voicing]);

  if (!voicing || !voicing.frets) return null;

  const displayStrings = [0, 1, 2, 3, 4, 5];
  const activeFretNums = voicing.frets.filter((f: any) => (f.fret ?? 0) > 0).map((f: any) => f.fret as number);
  if (voicing.capo && voicing.capo > 0) activeFretNums.push(voicing.capo);
  const minFret = (voicing.type === 'open' || activeFretNums.length === 0) ? 1 : Math.min(...activeFretNums);
  const maxFret = activeFretNums.length ? Math.max(...activeFretNums) : 5;
  // Anchor the grid to the nut only for a genuine open-position grip (the fretted
  // notes sit at/near the nut). An open shape pushed up the neck — e.g. by the
  // octave setting — has open strings AND high fretted notes; in that case window
  // the fretted notes and label the starting fret, while still drawing the open
  // strings above the nut, rather than a full-length neck with a huge empty gap.
  const hasOpenString = voicing.frets.some((f: any) => f.fret === 0);
  const isOpenPosition = minFret <= 1;
  const showOpenStrings = isOpenPosition || hasOpenString;
  const startFret = isOpenPosition ? 0 : minFret - 1;
  const fretNum = startFret + 1;
  const fretSuffix = fretNum === 1 ? 'st' : fretNum === 2 ? 'nd' : fretNum === 3 ? 'rd' : 'th';
  const fretLabel = isOpenPosition ? '' : `${fretNum}${fretSuffix}`;
  const NUM_FRETS = Math.max(5, maxFret - startFret + 1);
  const SVG_W = MARGIN_LEFT + STR_SPACING * 5 + MARGIN_LEFT;
  const SVG_H = MARGIN_TOP + FRET_SPACING * NUM_FRETS + MARGIN_BOTTOM;
  
  const flashDot = (key: string) => {
    const anim = getFlashAnim(key);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.35, duration: 80, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  };
  
  if (imperativeFlashRef) {
    imperativeFlashRef.current = (midi: number) => {
      // Step 1: Try to find an exact physical MIDI match
      let strIdx = voicing.frets.findIndex((f: any, i: any) => f.fret !== null && GS_MIDI[i] + (f.fret as number) === midi);
      
      // Step 2: Smart Fallback - If exact note isn't in this voicing, match by Pitch Class (e.g. any 'C')
      if (strIdx === -1) {
         strIdx = voicing.frets.findIndex((f: any, i: any) => f.fret !== null && (GS_MIDI[i] + (f.fret as number)) % 12 === midi % 12);
      }
      
      if (strIdx !== -1) {
        const fret = voicing.frets[strIdx].fret;
        if (fret !== null) flashDot(`${strIdx}-${fret}`);
      }
    };
  }

  return (
    <View style={{ alignItems: 'center' }}>
      <FretboardMiniMap minFret={isOpenPosition ? 1 : minFret} maxFret={maxFret} theme={theme} />
      <View style={[styles.diagramWrap, { width: SVG_W, height: SVG_H }]}>
        <Svg width={SVG_W} height={SVG_H} style={{ position: 'absolute', top: 0, left: 0 }}>
          {displayStrings.map((strIdx, displayPos) => {
          const cx = MARGIN_LEFT + displayPos * STR_SPACING;
          const fretObj = voicing.frets[strIdx];
          const normRoleTop = fretObj.role === '1' ? 'R' : fretObj.role;
          const color = colorMode === 'roles' ? (fretObj.role ? (ROLE_COLORS_GLOBAL[normRoleTop] ?? theme.accent) : theme.accent) : theme.accent;
          return (
            <React.Fragment key={`top-${strIdx}`}>
              {fretObj.fret === null ? ( <SvgText x={cx} y={MARGIN_TOP - 13} fontSize={16} fill={theme.txt3} textAnchor="middle" fontWeight="700">×</SvgText> ) :
               fretObj.fret === 0 ? null :
               ( <SvgText x={cx} y={MARGIN_TOP - 15} fontSize={13} fill={theme.txt2} textAnchor="middle" fontWeight="600">{STRING_LABELS[strIdx]}</SvgText> )}
            </React.Fragment>
          );
        })}
        {isOpenPosition && ( <Rect x={MARGIN_LEFT - 1.25} y={MARGIN_TOP - 5} width={STR_SPACING * 5 + 1.75} height={5} fill={theme.txt1} /> )}
        {!isOpenPosition && ( <SvgText x={MARGIN_LEFT - 20} y={MARGIN_TOP + FRET_SPACING * 0.6} fontSize={14} fill={theme.txt2} textAnchor="end" fontWeight="700">{fretLabel}</SvgText> )}
        {Array.from({ length: NUM_FRETS + 1 }).map((_, fi) => ( <Line key={`fret-${fi}`} x1={MARGIN_LEFT} y1={MARGIN_TOP + fi * FRET_SPACING} x2={MARGIN_LEFT + STR_SPACING * 5} y2={MARGIN_TOP + fi * FRET_SPACING} stroke={theme.border} strokeWidth={1} /> ))}
        {displayStrings.map((strIdx, displayPos) => {
          const x = MARGIN_LEFT + displayPos * STR_SPACING;
          const thickness = 2.5 - strIdx * 0.3;
          return ( <Line key={`str-${strIdx}`} x1={x} y1={MARGIN_TOP} x2={x} y2={MARGIN_TOP + FRET_SPACING * NUM_FRETS} stroke={theme.txt2} strokeWidth={Math.max(0.5, thickness)} /> );
        })}
        {[3,5,7,9,15,17,19,21].map(fn => {
          const relFret = fn - startFret;
          if (relFret < 1 || relFret > NUM_FRETS) return null;
          return ( <Circle key={`marker-${fn}`} cx={MARGIN_LEFT + STR_SPACING * 2.5} cy={MARGIN_TOP + (relFret - 0.5) * FRET_SPACING} r={3} fill={theme.border} /> );
        })}
        {[12, 24].map(fn => {
          const relFret = fn - startFret;
          if (relFret < 1 || relFret > NUM_FRETS) return null;
          return (
            <React.Fragment key={`marker-${fn}`}>
              <Circle cx={MARGIN_LEFT + STR_SPACING * 1.5} cy={MARGIN_TOP + (relFret - 0.5) * FRET_SPACING} r={3} fill={theme.border} />
              <Circle cx={MARGIN_LEFT + STR_SPACING * 3.5} cy={MARGIN_TOP + (relFret - 0.5) * FRET_SPACING} r={3} fill={theme.border} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, width: SVG_W, height: SVG_H }}>
        {/* Ghost Scale Dots */}
        {(() => {
          const seen = new Set();
          return overlayNotes.filter((note: any) => {
            const key = `${note.stringIdx}-${note.fret}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }).map((note: any) => {
            const { stringIdx, fret, role, formula } = note;
            
            // CORRECT CLIPPING LOGIC: Hide open strings if not shown, hide frets outside the drawn boxes
            if (fret < 0) return null;
            if (fret === 0 && !showOpenStrings) return null;
            if (fret > 0 && (fret <= startFret || fret > startFret + NUM_FRETS)) return null;
            
            const isOccupied = voicing.frets[stringIdx]?.fret === fret;
            if (isOccupied) return null;

            const isRoot = role === '1' || role === 'R' || role === 'root' || formula === '1' || formula === 'R';
            const effectiveFormula = formula || role;
            const normKey = effectiveFormula === '1' ? 'R' : effectiveFormula;
            const normRole = role === '1' ? 'R' : role;
            const selectiveRoles = useSettingsStore.getState().selectiveRoles;
            const resolvedColor = getNoteColor(normKey, colorMode, theme, selectiveRoles);
            
            let color, textColor, borderColor, openColor;
            if (colorMode === 'theme') {
              color = theme.accent; 
              textColor = '#fff'; 
              borderColor = 'transparent'; 
              openColor = theme.accent;
            } else if (colorMode === 'selective') {
              color = resolvedColor;
              textColor = resolvedColor === theme.mutedNote ? theme.txt1 : '#fff';
              borderColor = resolvedColor === theme.mutedNote ? theme.border : 'transparent';
              openColor = resolvedColor === theme.mutedNote ? theme.txt2 : resolvedColor;
            } else {
              const roleColor = ROLE_COLORS_GLOBAL[normKey] ?? ROLE_COLORS_GLOBAL[normRole];
              if (roleColor) {
                color = roleColor; textColor = '#fff'; borderColor = 'transparent'; openColor = color;
              } else {
                color = theme.bg3; textColor = theme.txt1; borderColor = theme.border; openColor = theme.txt2;
              }
            }

            const cx = MARGIN_LEFT + stringIdx * STR_SPACING;
            const cy = fret === 0 ? MARGIN_TOP - 20 : MARGIN_TOP + (fret - startFret - 0.5) * FRET_SPACING;
            const midi = GS_MIDI[stringIdx] + fret;
            const labelStr = getGlobalLabel(labelMode, namingMode, rootSemi, formula, role, midi, note.noteName);
            const stableKey = `ghost-${stringIdx}-${fret}`;
            const dotKey = `${stringIdx}-${fret}`;

            return (
              <FretboardNote 
                key={stableKey} 
                viewportShift={startFret}
                cx={cx} 
                cy={cy}
                color={color} 
                textColor={textColor}
                borderColor={borderColor}
                openColor={openColor}
                label={labelStr}
                isActive={true}
                isOpen={fret === 0}
                bg="transparent"
                isGhost={note.isGhost !== undefined ? note.isGhost : true}
                isRootProp={isRoot}
                flashAnim={getFlashAnim(dotKey)} 
                onNotePress={() => { flashDot(dotKey); onNotePress?.(GS_MIDI[stringIdx] + fret); }} 
              />
            );
          });
        })()}
        {voicing.capo && voicing.capo > 0 && (() => {
          const cxStart = MARGIN_LEFT;
          const cxEnd = MARGIN_LEFT + 5 * STR_SPACING;
          const relativeCapoFret = voicing.capo - startFret;
          return ( <Animated.View style={{ position: 'absolute', left: cxStart - DOT_R - 4, top: MARGIN_TOP + (relativeCapoFret - 0.5) * FRET_SPACING - DOT_R - 4, width: (cxEnd - cxStart) + DOT_R * 2 + 8, height: DOT_R * 2 + 8, borderRadius: DOT_R + 4, backgroundColor: theme.txt1, opacity: entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.15], extrapolate: 'clamp' }), transform: [{ scale: entranceAnim }] }} pointerEvents="none" /> );
        })()}
        {voicing.type === 'barre' && activeFretNums.length > 0 && (() => {
          let barreStartStr = voicing.frets.findIndex((f: any) => f.fret !== null);
          let barreFret = minFret;
          
          // Intercept for A Shape 9 and A Shape m9 (x - R - 3rd - b7 - 9 - 5)
          const fA = voicing.frets[1]?.fret;
          const fD = voicing.frets[2]?.fret;
          const fG = voicing.frets[3]?.fret;
          const fB = voicing.frets[4]?.fret;
          const fe = voicing.frets[5]?.fret;
          
          // If the top 3 strings are on the same fret as the A string, but the D string is lower:
          if (fA !== null && fD !== null && fG !== null && fA === fG && fG === fB && fB === fe && fD < fA) {
            barreStartStr = 3; // Force the barre to start on the G string
            barreFret = fA;    // Force the barre to sit at the Root fret (e.g. 8th fret instead of 7th)
          }

          const cxStart = MARGIN_LEFT + barreStartStr * STR_SPACING;
          const cxEnd = MARGIN_LEFT + 5 * STR_SPACING; 
          return ( <Animated.View style={{ position: 'absolute', left: cxStart - DOT_R - 4, top: MARGIN_TOP + (barreFret - startFret - 0.5) * FRET_SPACING - DOT_R - 4, width: (cxEnd - cxStart) + DOT_R * 2 + 8, height: DOT_R * 2 + 8, borderRadius: DOT_R + 4, backgroundColor: theme.txt1, opacity: entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.15], extrapolate: 'clamp' }), transform: [{ scale: entranceAnim }] }} pointerEvents="none" /> );
        })()}
        {displayStrings.map((strIdx, displayPos) => {
          const fretObj = voicing.frets[strIdx];
          const isActive = fretObj.fret !== null;
          const activeFret = isActive ? fretObj.fret : 1;
          const isZero = activeFret === 0;
          const midi = GS_MIDI[strIdx] + activeFret;
          const isDropOrShell = voicing.type === 'drop2' || voicing.type === 'drop3' || voicing.type === 'drop2and4' || voicing.type === 'shell';
          const formula = isDropOrShell
            ? (fretObj.role ? (ROLE_SHORT[fretObj.role] ?? fretObj.role) : (formulaByPC[midi % 12] || ''))
            : (formulaByPC[midi % 12] || (fretObj.role ? (ROLE_SHORT[fretObj.role] ?? fretObj.role) : '') || '');
          
          const cx = MARGIN_LEFT + displayPos * STR_SPACING;
          const cy = isZero ? MARGIN_TOP - 20 : MARGIN_TOP + (activeFret - startFret - 0.5) * FRET_SPACING;
          const normRole = fretObj.role === '1' ? 'R' : fretObj.role;
          const normFormula = formula === '1' ? 'R' : formula;
          
          const isRoot = normRole === 'R' || normFormula === 'R';
          const effectiveFormula = formula || fretObj.role;
          const normKey = effectiveFormula === '1' ? 'R' : effectiveFormula;
          const selectiveRoles = useSettingsStore.getState().selectiveRoles;
          const resolvedColor = getNoteColor(normKey, colorMode, theme, selectiveRoles);

          let color, textColor, borderColor, openColor;
          if (colorMode === 'theme') {
            color = theme.accent; 
            textColor = '#fff'; 
            borderColor = 'transparent'; 
            openColor = theme.accent;
          } else if (colorMode === 'selective') {
            color = resolvedColor;
            textColor = resolvedColor === theme.mutedNote ? theme.txt1 : '#fff';
            borderColor = resolvedColor === theme.mutedNote ? theme.border : 'transparent';
            openColor = resolvedColor === theme.mutedNote ? theme.txt2 : resolvedColor;
          } else {
            const roleColor = ROLE_COLORS_GLOBAL[normKey] ?? ROLE_COLORS_GLOBAL[normRole];
            if (roleColor) {
              color = roleColor; textColor = '#fff'; borderColor = 'transparent'; openColor = color;
            } else {
              color = theme.bg3; textColor = theme.txt1; borderColor = theme.border; openColor = theme.txt2;
            }
          }

          const label = getGlobalLabel(labelMode, namingMode, rootSemi, formula, fretObj.role, midi);
          // Key is just the string! This allows it to slide up and down the string smoothly.
          const stableKey = `active-${strIdx}`;
          const dotKey = `${strIdx}-${activeFret}`;

          return (
            <FretboardNote 
              key={stableKey}
              viewportShift={startFret}
              cx={cx} 
              cy={cy}
              color={color} 
              textColor={textColor}
              borderColor={borderColor}
              openColor={openColor}
              label={label} 
              isActive={isActive}
              isOpen={isZero}
              bg={theme.bg2}
              isRootProp={isRoot}
              flashAnim={getFlashAnim(dotKey)} 
              onNotePress={() => { flashDot(dotKey); onNotePress?.(midi); }} 
            />
          );
        })}
      </View>
    </View>
    </View>
  );
});

const FretboardView = React.memo(React.forwardRef<FretboardViewRef, Props>(function FretboardView({
  groups, theme, onNotePress, onPlayVoicing, onNavigate, rootSemi, chordName = '', chordType, triggerFlash = 0,
  labelMode = 'degrees', scaleVoicings = [], scaleMode = false, formulaByPC = {},
  defaultGroupIdx = 0, arpMode = false, arpVoicings = [], arpSubsets = [], arpSubsetIdx = 0,
  onArpSubsetChange, shapesMode = false, shapeVoicings = [], header, namingMode = 'sharp',
      selectedBoxName, selectedScaleId, onBoxChange, onScaleChange, scaleOverlay = false, overlayNotes = [],
      parentScales = [], activeParentScale, onParentScaleChange, hideNavigators = false, colorModeOverride
    }, fretboardRef) {
  const chordFlashRef = React.useRef<((midi: number) => void) | null>(null);
  
  const [groupIdx, setGroupIdx] = useState(defaultGroupIdx);
  const [voicingIdx, setVoicingIdx] = useState(0);
  
  // Fallback state for when parent doesn't provide onBoxChange/onScaleChange
  const [localBoxName, setLocalBoxName] = useState<string | null>(null);
  const [localScaleId, setLocalScaleId] = useState<string | null>(null);

  React.useEffect(() => { 
    setGroupIdx(defaultGroupIdx); 
    setVoicingIdx(0);
    setLocalBoxName(null);
    setLocalScaleId(null);
  }, [defaultGroupIdx, chordType, rootSemi, groups?.length]);

  const handleBoxChange = (box: string) => {
    if (onBoxChange) onBoxChange(box);
    else setLocalBoxName(box);
  };

  const handleScaleChange = (scale: string) => {
    if (onScaleChange) onScaleChange(scale);
    else setLocalScaleId(scale);
  };

  const { octave, instrument } = useSettingsStore();
  const fretShift = instrument === 'guitar' ? (octave - 1) * 12 : 0;

  const shiftVoicing = (v: any) => {
    if (!v || fretShift === 0) return v;
    return {
      ...v,
      // Change type so the diagram doesn't force minFret to 1, avoiding the "long ass neck"
      type: v.type === 'open' ? 'shifted-open' : v.type,
      capo: v.capo ? v.capo + fretShift : v.capo,
      frets: v.frets?.map((f: any) => ({
        ...f,
        // Keep open strings exactly where they are at the nut
        fret: f.fret !== null ? (f.fret === 0 ? 0 : f.fret + fretShift) : null
      }))
    };
  };

  const shiftScale = (sv: any) => {
    if (!sv || fretShift === 0) return sv;
    
    // Find the lowest NON-zero fret to serve as our new box anchor, bypassing open strings
    const nonZeroFrets = sv.notes.filter((n: any) => n.fret > 0).map((n: any) => n.fret);
    const newMin = nonZeroFrets.length > 0 ? Math.min(...nonZeroFrets) + fretShift : sv.minFret + fretShift;
    
    return {
      ...sv,
      minFret: newMin,
      maxFret: sv.maxFret + fretShift,
      notes: sv.notes?.map((n: any) => ({
        ...n,
        fret: n.fret !== null ? (n.fret === 0 ? 0 : n.fret + fretShift) : null
      }))
    };
  };

  // Regular Chord Voicings
  const safeGroups = groups ?? [];
  const safeGroupIdx = Math.min(groupIdx, Math.max(0, safeGroups.length - 1));
  const currentGroup = safeGroups[safeGroupIdx];
  const currentVoicings = currentGroup?.voicings ?? [];
  const safeVoicingIdx = Math.min(voicingIdx, Math.max(0, currentVoicings.length - 1));
  const currentVoicing = shiftVoicing(currentVoicings[safeVoicingIdx]);

  // Base Selected States
  const currentSelectedBox = selectedBoxName || localBoxName;
  const currentSelectedScale = selectedScaleId || localScaleId;

  // Arpeggios (Flat hierarchy since arpVoicings are pre-filtered by subset in PlayScreen)
  const uniqueArpBoxNames = [...new Set(arpVoicings.map((av: ScaleVoicing) => av.boxName))];
  const activeArpBoxName = currentSelectedBox && uniqueArpBoxNames.includes(currentSelectedBox) ? currentSelectedBox : uniqueArpBoxNames[0];
  const currentArpVoicing = shiftScale(arpVoicings.find((av: ScaleVoicing) => av.boxName === activeArpBoxName) ?? arpVoicings[0]);
  
  // Scales (Hierarchical: Scale -> Box)
  const uniqueScaleIds = [...new Set(scaleVoicings.map(sv => sv.scaleId))];
  const activeScaleId = currentSelectedScale && uniqueScaleIds.includes(currentSelectedScale) ? currentSelectedScale : uniqueScaleIds[0];
  const scalesForCurrentId = scaleVoicings.filter(sv => sv.scaleId === activeScaleId);
  
  const uniqueBoxNames = [...new Set(scalesForCurrentId.map(sv => sv.boxName))];
  const activeScaleBoxName = currentSelectedBox && uniqueBoxNames.includes(currentSelectedBox) ? currentSelectedBox : uniqueBoxNames[0];
  const currentScaleVoicing = shiftScale(scalesForCurrentId.find(sv => sv.boxName === activeScaleBoxName) ?? scalesForCurrentId[0]);

  // Shapes (Hierarchical: Shape -> Box)
  // 1. Get ALL unique shapes available for this chord, regardless of box
  const allUniqueShapeScaleIds = [...new Set(shapeVoicings.map(sv => sv.scaleId))];
  const activeShapeScaleId = currentSelectedScale && allUniqueShapeScaleIds.includes(currentSelectedScale) ? currentSelectedScale : allUniqueShapeScaleIds[0];
  
  // 2. Filter down to ONLY the voicings that match the chosen Shape (this yields exactly 5 boxes)
  const shapesForCurrentScale = shapeVoicings.filter(sv => sv.scaleId === activeShapeScaleId);
  
  // 3. Extract the 5 box names for the top paginator
  const uniqueShapesBoxNames = [...new Set(shapesForCurrentScale.map(sv => sv.boxName))];
  const activeShapesBoxName = currentSelectedBox && uniqueShapesBoxNames.includes(currentSelectedBox) ? currentSelectedBox : uniqueShapesBoxNames[0];
  
  // 4. Select the final voicing
  const currentShapeVoicing = shiftScale(shapesForCurrentScale.find(sv => sv.boxName === activeShapesBoxName) ?? shapesForCurrentScale[0]);
  
  // Alias it back so the paginator buttons keep working without rewriting them
  const uniqueShapeScaleIds = allUniqueShapeScaleIds;

  const shiftedOverlayNotes = overlayNotes.map((n: any) => ({
    ...n,
    fret: n.fret !== null ? (n.fret === 0 ? 0 : n.fret + fretShift) : null
  }));

  React.useImperativeHandle(fretboardRef, () => ({
    flashMidi: (midi: number) => chordFlashRef.current?.(midi), 
    flashAll: (midiNotes: number[]) => midiNotes.forEach(m => chordFlashRef.current?.(m)),
    nextVoicing: () => {
      if (shapesMode) {
        const idx = uniqueShapeScaleIds.indexOf(activeShapeScaleId);
        const nextIdx = (idx + 1) % Math.max(1, uniqueShapeScaleIds.length);
        handleScaleChange(uniqueShapeScaleIds[nextIdx]);
      } else if (arpMode) {
        onArpSubsetChange?.((arpSubsetIdx + 1) % Math.max(1, arpSubsets.length)); 
      } else if (scaleMode) {
        const idx = uniqueScaleIds.indexOf(activeScaleId);
        const nextIdx = (idx + 1) % Math.max(1, uniqueScaleIds.length);
        handleScaleChange(uniqueScaleIds[nextIdx]);
      } else {
        setVoicingIdx((safeVoicingIdx + 1) % Math.max(1, currentVoicings.length)); 
      }
      onNavigate?.(); 
    },
    prevVoicing: () => {
      if (shapesMode) {
        const idx = uniqueShapeScaleIds.indexOf(activeShapeScaleId);
        const nextIdx = (idx - 1 + uniqueShapeScaleIds.length) % Math.max(1, uniqueShapeScaleIds.length);
        handleScaleChange(uniqueShapeScaleIds[nextIdx]);
      } else if (arpMode) {
        onArpSubsetChange?.((arpSubsetIdx - 1 + arpSubsets.length) % Math.max(1, arpSubsets.length)); 
      } else if (scaleMode) {
        const idx = uniqueScaleIds.indexOf(activeScaleId);
        const nextIdx = (idx - 1 + uniqueScaleIds.length) % Math.max(1, uniqueScaleIds.length);
        handleScaleChange(uniqueScaleIds[nextIdx]);
      } else {
        setVoicingIdx((safeVoicingIdx - 1 + currentVoicings.length) % Math.max(1, currentVoicings.length)); 
      }
      onNavigate?.(); 
    }
  }));

  // --- Formatting Helpers for Professional UI ---
  const formatVoicingName = (name?: string) => {
    if (!name) return '';
    const cleaned = String(name)
      .replace(/_/g, ' ')
      .replace(/ \[.*?Str\]/g, '') // Remove developer tags like [A Str]
      .replace(/\s*\[\d(?:-\d)+\]/g, '') // Remove injected string sets like [5-4-3-2]
      .replace(/\s*\([A-G]\s*(Pos|Shape)\)/gi, '') // Remove redundant shape/pos labels
      .replace(/(?:from|on)\s+(?:b|#|♭|♯)?\w+\s*\((.*?)\)/gi, '$1')
      .replace(/Root Pattern\s*\((.*?)\)/gi, '$1')
      .replace(/(?:from|on)\s+(?:b|#|♭|♯)?\w+/gi, '')
      .replace(/\(Root Pos\)/gi, 'Root Position')
      .replace(/\(1st Inv\)/gi, '1st Inversion')
      .replace(/\(2nd Inv\)/gi, '2nd Inversion')
      .replace(/\(3rd Inv\)/gi, '3rd Inversion')
      .replace(/Drop 2 & 4|Drop 2|Drop 3|Shell/gi, '') // Strip all structural prefixes
      .replace(/\(\s*\)/g, '') // Remove empty parens
      .replace(/^-?\s*/, '') // Remove any leading hyphens
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim()
      .replace(/b(?=\d)/g, '♭')
      .replace(/#(?=\d)/g, '♯')
      .replace(/([A-G])b/g, '$1♭')
      .replace(/([A-G])#/g, '$1♯');
      
    return formatChordSymbol(cleaned);
  };
  // ----------------------------------------------

  React.useLayoutEffect(() => {
    if (!onPlayVoicing) return;

    if (scaleMode && currentScaleVoicing) {
      const validNotes = currentScaleVoicing.notes.filter((n: any) => n.fret >= 0);
      const midiNotes = validNotes.map((n: any) => GS_MIDI[n.stringIdx] + n.fret).sort((a: any, b: any) => a - b);
      const uniqueMidi = midiNotes.filter((m: any, i: number, arr: any[]) => m !== arr[i - 1]);
      
      const pcs = new Set<number>();
      const items: any[] = [];
      validNotes.forEach((n: any) => {
         const pc = (GS_MIDI[n.stringIdx] + n.fret) % 12;
         if (!pcs.has(pc)) {
           pcs.add(pc);
           let iv = (pc - rootSemi) % 12;
           if (iv < 0) iv += 12;
           items.push({ iv, role: n.role || '', formula: n.formula || ROLE_SHORT[n.role] || 'R' });
         }
      });
      items.sort((a: any, b: any) => getRank(a) - getRank(b));

      onPlayVoicing(uniqueMidi, currentScaleVoicing.scaleName || '', items.map(i=>i.role), items.map(i=>i.iv), undefined, items.map(i=>i.formula));
    } else if (shapesMode && currentShapeVoicing) {
      const validNotes = currentShapeVoicing.notes.filter((n: any) => n.fret >= 0);
      const midiNotes = validNotes.map((n: any) => GS_MIDI[n.stringIdx] + n.fret).sort((a: any, b: any) => a - b);
      const uniqueMidi = midiNotes.filter((m: any, i: number, arr: any[]) => m !== arr[i - 1]);
      const pcs = new Set<number>();
      const items: any[] = [];
      validNotes.forEach((n: any) => {
        const pc = (GS_MIDI[n.stringIdx] + n.fret) % 12;
        if (!pcs.has(pc)) {
          pcs.add(pc);
          let iv = (pc - rootSemi) % 12;
          if (iv < 0) iv += 12;
          items.push({ iv, role: n.role || '', formula: n.formula || 'R' });
        }
      });
      items.sort((a: any, b: any) => getRank(a) - getRank(b));
      onPlayVoicing(uniqueMidi, currentShapeVoicing.scaleName || '', items.map(i => i.role), items.map(i => i.iv), undefined, items.map(i => i.formula));
    } else if (arpMode && currentArpVoicing) {
      const validNotes = currentArpVoicing.notes.filter((n: any) => n.fret >= 0);
      const midiNotes = validNotes.map((n: any) => GS_MIDI[n.stringIdx] + n.fret).sort((a: any, b: any) => a - b);
      const uniqueMidi = midiNotes.filter((m: any, i: number, arr: any[]) => m !== arr[i - 1]);
      
      const pcs = new Set<number>();
      const items: any[] = [];
      validNotes.forEach((n: any) => {
         const pc = (GS_MIDI[n.stringIdx] + n.fret) % 12;
         if (!pcs.has(pc)) {
           pcs.add(pc);
           let iv = (pc - rootSemi) % 12;
           if (iv < 0) iv += 12;
           items.push({ iv, role: n.role || '', formula: n.formula || 'R' });
         }
      });
      items.sort((a: any, b: any) => getRank(a) - getRank(b));

      onPlayVoicing(uniqueMidi, arpSubsets[arpSubsetIdx]?.label || '', items.map(i=>i.role), items.map(i=>i.iv), undefined, items.map(i=>i.formula));
    } else if (currentVoicing && !scaleMode && !arpMode) {
      const activeFrets = currentVoicing.frets.map((f: any, i: number) => ({...f, strIdx: i})).filter((f: any) => f.fret !== null);
      const midiNotes = activeFrets.map((f: any) => GS_MIDI[f.strIdx] + (f.fret as number));
      
      const spelledNames = activeFrets.map((f: any) => {
        const midi = GS_MIDI[f.strIdx] + (f.fret as number);
        const formula = formulaByPC[midi % 12] || (f.role ? (ROLE_SHORT[f.role] || f.role) : '');
        return formula ? spellInterval(rootSemi, formula, namingMode === 'flat') : (namingMode === 'flat' ? NOTE_FLAT[midi % 12] : NOTE_SHARP[midi % 12]);
      });

      const pcs = new Set<number>();
      const items: any[] = [];
      activeFrets.forEach((f: any) => {
         const pc = (GS_MIDI[f.strIdx] + (f.fret as number)) % 12;
         if (!pcs.has(pc)) {
           pcs.add(pc);
           let iv = (pc - rootSemi) % 12;
           if (iv < 0) iv += 12;
           const formula = formulaByPC[pc] || (f.role ? (ROLE_SHORT[f.role] || f.role) : '');
           items.push({ iv, role: f.role || '', formula });
         }
      });
      items.sort((a: any, b: any) => getRank(a) - getRank(b));
      
      let localSlash = '';
      if (activeFrets.length > 0) {
        const bassMidi = GS_MIDI[activeFrets[0].strIdx] + (activeFrets[0].fret as number);
        if (bassMidi % 12 !== rootSemi % 12) {
          // Prevent double slashes if the chord label already contains one
          if (!/\/\s*[A-G]/i.test(currentVoicing.chordLabel || '')) {
            const bassPc = bassMidi % 12;
            const bassRole = activeFrets[0].role;
            const formula = formulaByPC[bassPc] || (bassRole ? (ROLE_SHORT[bassRole] || bassRole) : '');
            const spelledBass = formula ? spellInterval(rootSemi, formula, namingMode === 'flat') : (namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[bassPc];
            localSlash = ` / ${spelledBass}`;
          }
        }
      }

      onPlayVoicing(midiNotes, `${currentVoicing.chordLabel}${localSlash}`, items.map(i=>i.role), items.map(i=>i.iv), spelledNames, items.map(i=>i.formula));
    }
  }, [
    scaleMode, arpMode, shapesMode, chordName, rootSemi, arpSubsetIdx,
    currentVoicing ? JSON.stringify(currentVoicing.frets) : null,
    currentScaleVoicing ? JSON.stringify(currentScaleVoicing.notes) : null,
    currentShapeVoicing ? JSON.stringify(currentShapeVoicing.notes) : null,
    currentArpVoicing ? JSON.stringify(currentArpVoicing.notes) : null,
    JSON.stringify(arpSubsets[arpSubsetIdx] || {})
  ]);

  const getFretboardSlash = () => {
    if (!currentVoicing || scaleMode || arpMode || shapesMode) return '';
    const specificName = formatVoicingName(currentVoicing?.name);
    const baseName = formatVoicingName(currentVoicing?.chordLabel || chordName);
    const isChordLike = /(?:^|\s)[A-G][b♭#♯]?(?:\s|$|m|M|maj|min|dim|aug|sus|alt|\d)/.test(specificName);
    const topFretLabel = isChordLike ? specificName : baseName;

    // Prevent double slashes in the paginator UI
    if (/\/\s*[A-G]/i.test(topFretLabel)) return '';

    const activeFrets = currentVoicing.frets.map((f: any, i: number) => ({...f, strIdx: i})).filter((f: any) => f.fret !== null);
    if (!activeFrets.length) return '';
    const bassPc = (GS_MIDI[activeFrets[0].strIdx] + activeFrets[0].fret) % 12;

    // Slash relative to the chord ACTUALLY being labelled — an embedded triad or a
    // rootless drop shape can have a root different from the global rootSemi. Only a
    // genuine inversion (bass ≠ that root) gets a "/ bass"; root position shows none.
    // (Fixes "C#dim/C#": bass = the chord's own root, so no slash.)
    const NAME_PC: Record<string, number> = { 'C':0,'C♯':1,'C#':1,'D♭':1,'Db':1,'D':2,'D♯':3,'D#':3,'E♭':3,'Eb':3,'E':4,'F':5,'F♯':6,'F#':6,'G♭':6,'Gb':6,'G':7,'G♯':8,'G#':8,'A♭':8,'Ab':8,'A':9,'A♯':10,'A#':10,'B♭':10,'Bb':10,'B':11 };
    const rootTok = (topFretLabel.trim().match(/^([A-G][#♯b♭]?)/) || [])[1];
    const displayedRootPc = (rootTok != null && NAME_PC[rootTok] != null) ? NAME_PC[rootTok] : rootSemi % 12;
    if (bassPc === displayedRootPc) return '';

    // Spell the bass by its INTERVAL/formula, never by raw pitch class — e.g. the ♯5
    // of A7♯5♭9 must read E♯, not F. (formulaByPC carries the chord-correct degree.)
    const bassRole = activeFrets[0].role;
    const bassFormula = formulaByPC[bassPc] || (bassRole ? (ROLE_SHORT[bassRole] || bassRole) : '');
    const spelledBass = bassFormula
      ? spellInterval(rootSemi, bassFormula, namingMode === 'flat')
      : (namingMode === 'flat' ? NOTE_FLAT : NOTE_SHARP)[bassPc];
    return ` / ${spelledBass}`;
  };
  const slashSuffix = getFretboardSlash();

  const specificName = formatVoicingName(currentVoicing?.name);
  const baseName = formatVoicingName(currentVoicing?.chordLabel || chordName);

  const isTriad = currentVoicing?.type === 'triad';
  // Drops & triads read better as chord name + bass (e.g. "Cadd9 / D") than as an
  // inversion ordinal ("3rd Inversion") — the inversion is already implied by the bass.
  const isChordNameVoicing = isTriad || currentVoicing?.type === 'drop2' || currentVoicing?.type === 'drop3' || currentVoicing?.type === 'drop2and4';
  const bottomMainText = isChordNameVoicing
    ? `${baseName}${slashSuffix}`
    : (specificName || baseName);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
      {header}

      {/* Navigator 1: Group/Position/Shape */}
      {!hideNavigators && (scaleMode || arpMode || shapesMode || safeGroups.length > 0) && (
  <View style={[styles.navContainer, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={() => { 
          import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); 
          if (scaleMode) {
            const idx = uniqueBoxNames.indexOf(activeScaleBoxName);
            handleBoxChange(uniqueBoxNames[(idx - 1 + Math.max(1, uniqueBoxNames.length)) % Math.max(1, uniqueBoxNames.length)]);
          } else if (shapesMode) {
            const idx = uniqueShapesBoxNames.indexOf(activeShapesBoxName);
            handleBoxChange(uniqueShapesBoxNames[(idx - 1 + Math.max(1, uniqueShapesBoxNames.length)) % Math.max(1, uniqueShapesBoxNames.length)]);
          } else if (arpMode) {
            const idx = uniqueArpBoxNames.indexOf(activeArpBoxName);
            handleBoxChange(uniqueArpBoxNames[(idx - 1 + Math.max(1, uniqueArpBoxNames.length)) % Math.max(1, uniqueArpBoxNames.length)]);
          } else {
            setGroupIdx((safeGroupIdx + 1) % Math.max(1, safeGroups.length));
            setVoicingIdx(0);
          }
          onNavigate?.(); 
        }}>
          <Text style={[styles.navArrow, { color: theme.txt1 }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.navLabelWrap}>
          <Text style={[styles.navLabelTag, { color: theme.txt3 }]}>{scaleMode ? 'POSITION' : shapesMode ? 'POSITION' : arpMode ? 'SHAPE' : (currentVoicing?.type === 'open' || currentVoicing?.type === 'barre') ? 'POSITION' : 'STRING SET'}</Text>
          <Text style={[styles.navLabelTop, { color: theme.txt1 }]} numberOfLines={1}>
            {scaleMode ? formatVoicingName(currentScaleVoicing?.boxName) : 
             shapesMode ? formatVoicingName(currentShapeVoicing?.boxName) : 
             arpMode ? formatVoicingName(currentArpVoicing?.boxName) : 
             (currentVoicing?.type === 'open' || currentVoicing?.type === 'barre') ? formatVoicingName(currentGroup?.label) : 
             (currentVoicing?.frets ? currentVoicing.frets.map((f: any, i: number) => f.fret !== null ? 6 - i : null).filter((x: any) => x !== null).join('-') : formatVoicingName(currentGroup?.label))}
          </Text>
          <Text style={[styles.navLabelBot, { color: theme.txt3 }]}>{scaleMode ? `${Math.max(0, uniqueBoxNames.indexOf(activeScaleBoxName)) + 1}/${Math.max(1, uniqueBoxNames.length)}` : shapesMode ? `${Math.max(0, uniqueShapesBoxNames.indexOf(activeShapesBoxName)) + 1}/${Math.max(1, uniqueShapesBoxNames.length)}` : arpMode ? `${Math.max(0, uniqueArpBoxNames.indexOf(activeArpBoxName)) + 1}/${Math.max(1, uniqueArpBoxNames.length)}` : `${safeGroupIdx + 1}/${Math.max(1, safeGroups.length)}`}</Text>
        </View>
        <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={() => { 
          import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); 
          if (scaleMode) {
            const idx = uniqueBoxNames.indexOf(activeScaleBoxName);
            handleBoxChange(uniqueBoxNames[(idx + 1) % Math.max(1, uniqueBoxNames.length)]);
          } else if (shapesMode) {
            const idx = uniqueShapesBoxNames.indexOf(activeShapesBoxName);
            handleBoxChange(uniqueShapesBoxNames[(idx + 1) % Math.max(1, uniqueShapesBoxNames.length)]);
          } else if (arpMode) {
            const idx = uniqueArpBoxNames.indexOf(activeArpBoxName);
            handleBoxChange(uniqueArpBoxNames[(idx + 1) % Math.max(1, uniqueArpBoxNames.length)]);
          } else {
            setGroupIdx((safeGroupIdx - 1 + Math.max(1, safeGroups.length)) % Math.max(1, safeGroups.length));
            setVoicingIdx(0);
          }
          onNavigate?.(); 
        }}>
          <Text style={[styles.navArrow, { color: theme.txt1 }]}>›</Text>
        </TouchableOpacity>
      </View>
      )}

      {!hideNavigators && parentScales.length > 0 && (
        <View style={[styles.navContainer, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={() => { 
            import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); 
            const idx = parentScales.indexOf(activeParentScale || parentScales[0]);
            onParentScaleChange?.(parentScales[(idx - 1 + parentScales.length) % parentScales.length]);
          }}>
            <Text style={[styles.navArrow, { color: theme.txt1 }]}>‹</Text>
          </TouchableOpacity>
          <View style={styles.navLabelWrap}>
            <Text style={[styles.navLabelTag, { color: theme.txt3 }]}>PARENT MODE</Text>
            <Text style={[styles.navLabelTop, { color: theme.txt1 }]} numberOfLines={1}>{formatVoicingName(SCALES[activeParentScale || parentScales[0]]?.name || activeParentScale || parentScales[0])}</Text>
            <Text style={[styles.navLabelBot, { color: theme.txt3 }]}>{`${Math.max(0, parentScales.indexOf(activeParentScale || parentScales[0])) + 1}/${parentScales.length}`}</Text>
          </View>
          <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={() => { 
            import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); 
            const idx = parentScales.indexOf(activeParentScale || parentScales[0]);
            onParentScaleChange?.(parentScales[(idx + 1) % parentScales.length]);
          }}>
            <Text style={[styles.navArrow, { color: theme.txt1 }]}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      {!hideNavigators && (
      <View style={[styles.navContainer, { borderBottomColor: theme.border }]}>
      <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={() => { 
        import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); 
        if (shapesMode) {
          const idx = uniqueShapeScaleIds.indexOf(activeShapeScaleId);
          const nextIdx = (idx - 1 + uniqueShapeScaleIds.length) % uniqueShapeScaleIds.length;
          handleScaleChange(uniqueShapeScaleIds[nextIdx]);
        } else if (arpMode) {
          onArpSubsetChange?.((arpSubsetIdx - 1 + arpSubsets.length) % arpSubsets.length); 
        } else if (scaleMode) {
          const idx = uniqueScaleIds.indexOf(activeScaleId);
          const nextIdx = (idx - 1 + uniqueScaleIds.length) % uniqueScaleIds.length;
          handleScaleChange(uniqueScaleIds[nextIdx]);
        } else {
          setVoicingIdx((safeVoicingIdx - 1 + currentVoicings.length) % currentVoicings.length); 
        }
        onNavigate?.(); 
      }}>
        <Text style={[styles.navArrow, { color: theme.txt1 }]}>‹</Text>
      </TouchableOpacity>
      <View style={styles.navLabelWrap}>
        <Text style={[styles.navLabelTag, { color: theme.txt3 }]}>{scaleMode ? 'SCALE' : shapesMode ? 'SHAPE' : arpMode ? 'TYPE' : 'VOICING'}</Text>
        <Text style={[styles.navLabelTop, { color: theme.txt1 }]} numberOfLines={1}>
          {shapesMode ? formatVoicingName(currentShapeVoicing?.scaleName) : 
           arpMode ? formatVoicingName(arpSubsets[arpSubsetIdx]?.label) : 
           scaleMode ? formatVoicingName(currentScaleVoicing?.scaleName) : 
           `${bottomMainText.replace(/\s*\/\s*(?=[A-G])/gi, ' / ')}${isChordNameVoicing ? '' : slashSuffix}`}
        </Text>
        <Text style={[styles.navLabelBot, { color: theme.txt3 }]}>
          {shapesMode ? `${Math.max(0, uniqueShapeScaleIds.indexOf(activeShapeScaleId)) + 1}/${Math.max(1, uniqueShapeScaleIds.length)}` : 
           arpMode ? `${arpSubsetIdx + 1}/${Math.max(1, arpSubsets.length)}` : 
           scaleMode ? `${Math.max(0, uniqueScaleIds.indexOf(activeScaleId)) + 1}/${Math.max(1, uniqueScaleIds.length)}` : 
           `${safeVoicingIdx + 1}/${Math.max(1, currentVoicings.length)}`}
        </Text>
      </View>
      <TouchableOpacity style={[styles.navBtn, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={() => { 
        import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); 
        if (shapesMode) {
          const idx = uniqueShapeScaleIds.indexOf(activeShapeScaleId);
          const nextIdx = (idx + 1) % uniqueShapeScaleIds.length;
          handleScaleChange(uniqueShapeScaleIds[nextIdx]);
        } else if (arpMode) {
          onArpSubsetChange?.((arpSubsetIdx + 1) % arpSubsets.length); 
        } else if (scaleMode) {
          const idx = uniqueScaleIds.indexOf(activeScaleId);
          const nextIdx = (idx + 1) % uniqueScaleIds.length;
          handleScaleChange(uniqueScaleIds[nextIdx]);
        } else {
          setVoicingIdx((safeVoicingIdx + 1) % currentVoicings.length); 
        }
        onNavigate?.(); 
      }}>
        <Text style={[styles.navArrow, { color: theme.txt1 }]}>›</Text>
      </TouchableOpacity>
    </View>
      )}

      {currentVoicing || currentScaleVoicing || currentArpVoicing || currentShapeVoicing ? (
        <View style={{ paddingTop: 16, paddingBottom: 0 }}>
          {shapesMode ? ( <ScaleDiagram scaleVoicing={currentShapeVoicing} theme={theme} rootSemi={rootSemi} namingMode={namingMode} onNotePress={onNotePress} labelMode={labelMode} imperativeFlashRef={chordFlashRef} scaleOverlay={scaleOverlay} overlayNotes={shiftedOverlayNotes} colorModeOverride={colorModeOverride} /> ) :
           scaleMode ? ( <ScaleDiagram scaleVoicing={currentScaleVoicing} theme={theme} rootSemi={rootSemi} namingMode={namingMode} onNotePress={onNotePress} labelMode={labelMode} imperativeFlashRef={chordFlashRef} colorModeOverride={colorModeOverride} /> ) : 
           arpMode ? ( <ScaleDiagram scaleVoicing={currentArpVoicing} theme={theme} rootSemi={rootSemi} namingMode={namingMode} onNotePress={onNotePress} labelMode={labelMode} imperativeFlashRef={chordFlashRef} scaleOverlay={scaleOverlay} overlayNotes={shiftedOverlayNotes} colorModeOverride={colorModeOverride} /> ) : 
           ( <FretboardDiagram voicing={currentVoicing} theme={theme} rootSemi={rootSemi} onNotePress={onNotePress} triggerFlash={triggerFlash} labelMode={labelMode} formulaByPC={formulaByPC} imperativeFlashRef={chordFlashRef} namingMode={namingMode} overlayNotes={shiftedOverlayNotes} colorModeOverride={colorModeOverride} /> )}
        </View>
      ) : (
        <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.txt2, fontSize: 16, fontWeight: '700' }}>No Voicings Found</Text>
          <Text style={{ color: theme.txt3, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 18 }}>Try selecting a different chord or switching to another voicing category.</Text>
        </View> 
      )}
    </View>
  );
}));

export default FretboardView;

const styles = StyleSheet.create({
  container: { overflow: 'hidden', paddingTop: 0 },
  navContainer: { 
  flexDirection: 'row', 
  alignItems: 'center', 
  justifyContent: 'space-between', 
  padding: 12,
  borderBottomWidth: 1, // Added line
},
  navBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 24, fontWeight: '700', lineHeight: 28, marginTop: -2 },
  navLabelWrap: { flex: 1, alignItems: 'center' },
  navLabelTag: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  navLabelTop: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  navLabelBot: { fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  diagramWrap: { alignSelf: 'center', position: 'relative' },
  empty: { textAlign: 'center', padding: 20, paddingTop: 40, fontSize: 13 },
});