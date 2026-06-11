import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { ROLE_COLORS_GLOBAL, getNoteColor } from '@shared/ui/themes';
import { CH } from '@shared/theory/musicTheory';
import { useSettingsStore } from '@features/settings/store/settingsStore';

interface Props {
  chord: any;
  notes?: number[];
  theme: any;
  octave?: number;
  isMasked?: boolean;
}

const MiniPianoDiagram = React.memo(({ chord, notes: providedNotes, theme, octave = 4, isMasked }: Props) => {
  const colorMode = useSettingsStore((s: any) => s.colorMode);
  const selectiveRoles = useSettingsStore((s: any) => s.selectiveRoles);

  if (!chord && (!providedNotes || !providedNotes.length)) return <View style={{ height: 52 }} />;

  let activeNotes: number[] = [];
  let roles: string[] = [];

  const def = chord ? CH[chord.chordType] : null;

  if (providedNotes && providedNotes.length > 0) {
    activeNotes = providedNotes;
    roles = activeNotes.map((midi: number) => {
      const pc = midi % 12;
      if (def) {
        const idx = def.iv.findIndex((iv: number) => (chord.rootSemi + iv) % 12 === pc);
        if (idx !== -1) return def.f[idx];
      }
      return '';
    });
  } else if (def) {
    const intervals = def.iv.slice(0, 4);
    activeNotes = intervals.map((iv: number) => {
      const pc = (chord.rootSemi + iv) % 12;
      let midi = ((octave + 1) * 12) + pc;
      if (midi < ((octave + 1) * 12) + chord.rootSemi) midi += 12;
      return midi;
    });
    roles = def.f.slice(0, 4);
  }

  if (!activeNotes.length) return <View style={{ height: 52 }} />;

  const WHITE_WIDTH = 10;
  const WHITE_HEIGHT = 40;
  const BLACK_WIDTH = 6;
  const BLACK_HEIGHT = 24;
  
  let minMidi = Math.min(...activeNotes);
  let maxMidi = Math.max(...activeNotes);
  
  // 1. Symmetrically pad the diagram to guarantee the notes are perfectly centered
  const span = maxMidi - minMidi;
  if (span < 12) {
    // Force at least a 1-octave span for context
    const padding = Math.floor((12 - span) / 2);
    minMidi -= padding;
    maxMidi += padding;
  } else {
    minMidi -= 2;
    maxMidi += 2;
  }

  const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);

  // 2. Ensure the edges never end on a black key for a clean aesthetic
  while (isBlack(minMidi)) minMidi--;
  while (isBlack(maxMidi)) maxMidi++;

  const whiteKeys = [];
  const blackKeys = [];
  let whiteIdx = 0;
  
  for (let midi = minMidi; midi <= maxMidi; midi++) {
      const activeIdx = activeNotes.indexOf(midi);
      const active = activeIdx !== -1;
      
      let color = theme.accent;
      if (active) {
        const role = roles[activeIdx];
        color = (!isMasked && role) ? getNoteColor(role, colorMode, theme, selectiveRoles) : theme.accent;
      } else {
        color = '#fff';
      }
      
      if (!isBlack(midi)) {
          whiteKeys.push({ midi, active, color, x: whiteIdx * WHITE_WIDTH });
          whiteIdx++;
      } else {
          blackKeys.push({ midi, active, color: active ? color : '#222', x: (whiteIdx * WHITE_WIDTH) - (BLACK_WIDTH / 2) });
      }
  }

  const SVG_W = whiteIdx * WHITE_WIDTH;
  const SVG_H = WHITE_HEIGHT;
  
  // Calculate exact pixel bounds to prevent the "shrink-wrap" collapse bug
  const MAX_WIDTH = 68; // Slightly smaller safe maximum width for grid cells
  const scale = Math.min(1, MAX_WIDTH / SVG_W);
  const displayW = SVG_W * scale;
  const displayH = SVG_H * scale;
  
  return (
    <View style={{ height: 48, alignItems: 'center', justifyContent: 'center', marginTop: -4}}>
      <Svg 
        viewBox={`0 0 ${SVG_W} ${SVG_H}`} 
        width={displayW} 
        height={displayH} 
        preserveAspectRatio="xMidYMid meet"
      >
         {whiteKeys.map(k => (
           <Rect 
             key={k.midi} 
             x={k.x} y={0} 
             width={WHITE_WIDTH} height={WHITE_HEIGHT} 
             fill={k.color} 
             stroke={theme.border} strokeWidth={1} rx={1} 
           />
         ))}
         {blackKeys.map(k => (
           <Rect
             key={k.midi}
             x={k.x} y={0}
             width={BLACK_WIDTH} height={BLACK_HEIGHT}
             fill={k.color}
             rx={1}
           />
         ))}
         {/* Overall thin black border */}
         <Rect 
           x={0} y={0} 
           width={SVG_W} height={SVG_H} 
           fill="none" 
           stroke="#000" 
           strokeWidth={1.5} 
           rx={1} 
         />
      </Svg>
    </View>
  );
});

export default MiniPianoDiagram;