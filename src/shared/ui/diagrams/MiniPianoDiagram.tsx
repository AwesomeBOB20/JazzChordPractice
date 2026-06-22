import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Text as SvgText, Defs, RadialGradient, LinearGradient, Stop, Ellipse } from 'react-native-svg';
import { ROLE_COLORS_GLOBAL, getNoteColor } from '@shared/ui/themes';
import { CH, getGlobalLabel } from '@shared/theory/musicTheory';
import { useSettingsStore } from '@features/settings/store/settingsStore';
import { familyForWeight } from '@shared/fonts/fonts';

interface Props {
  chord: any;
  notes?: number[];
  theme: any;
  octave?: number;
  isMasked?: boolean;
  maxWidth?: number; // when set, the diagram scales UP to ~fill this width (capped); default keeps the compact 68px cap
  maxHeight?: number; // when set (dictionary grid), also bound the scale by height so the keyboard never spills its cell
  // When labelMode is set (and not 'none'), each active key shows its degree / note
  // name, following the global label preference. Omitted → no labels.
  labelMode?: 'degrees' | 'notes' | 'none';
  namingMode?: 'sharp' | 'flat';
  rootSemi?: number;
  noteFormulas?: string[]; // degree token per provided note (scale/arp) → degree colour + labels
}

const MiniPianoDiagram = React.memo(({ chord, notes: providedNotes, theme, octave = 4, isMasked, maxWidth, maxHeight, labelMode, namingMode, rootSemi, noteFormulas }: Props) => {
  const colorMode = useSettingsStore((s: any) => s.colorMode);
  const storeFontFamily = useSettingsStore((s: any) => s.fontFamily);
  const svgFont = familyForWeight(storeFontFamily, '700');
  const showLabels = !!labelMode && labelMode !== 'none';
  const selectiveRoles = useSettingsStore((s: any) => s.selectiveRoles);
  // Dark themes have a non-white bg2; soften the divider stroke between white keys so the
  // keys read as a more uniform white area rather than a grid chopped up by dark lines.
  const isDark = theme.bg2 !== '#FFFFFF';

  if (!chord && (!providedNotes || !providedNotes.length)) return <View style={{ height: 52 }} />;

  let activeNotes: number[] = [];
  let roles: string[] = [];

  const def = chord ? CH[chord.chordType] : null;

  if (providedNotes && providedNotes.length > 0) {
    activeNotes = providedNotes;
    // Prefer explicit degree tokens (scales/arps carry their own) so each note gets its
    // correct scale-degree colour; otherwise derive from the chord, if one was passed.
    roles = (noteFormulas && noteFormulas.length === providedNotes.length)
      ? noteFormulas
      : activeNotes.map((midi: number) => {
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
      const role = active ? roles[activeIdx] : '';

      let color = theme.accent;
      if (active) {
        color = (!isMasked && role) ? getNoteColor(role, colorMode, theme, selectiveRoles) : theme.accent;
      } else {
        color = '#fff';
      }

      const label = (active && showLabels) ? getGlobalLabel(labelMode!, namingMode || 'sharp', rootSemi, role, undefined, midi, undefined) : '';

      if (!isBlack(midi)) {
          whiteKeys.push({ midi, active, color, x: whiteIdx * WHITE_WIDTH, label });
          whiteIdx++;
      } else {
          blackKeys.push({ midi, active, color: active ? color : '#222', x: (whiteIdx * WHITE_WIDTH) - (BLACK_WIDTH / 2), label });
      }
  }

  const SVG_W = whiteIdx * WHITE_WIDTH;
  const SVG_H = WHITE_HEIGHT;

  // Default: cap at 68px (compact, for the progression grid). When a maxWidth is
  // given (dictionary grid), scale UP to roughly fill it so bigger chords read
  // clearly — capped at 2.4× so a 2-note interval doesn't blow up.
  // Fit BOTH width and height (and cap at 2.4×) so the keyboard can never spill its cell — width
  // alone let a wide cell scale the fixed-height keyboard past its slot. Default path is unchanged.
  const scale = maxWidth
    ? Math.min(2.4, maxWidth / SVG_W, maxHeight ? maxHeight / SVG_H : Infinity)
    : Math.min(1, 68 / SVG_W);
  const displayW = SVG_W * scale;
  const displayH = SVG_H * scale;

  return (
    <View style={{ height: maxWidth ? Math.ceil(displayH) : 48, alignItems: 'center', justifyContent: 'center', marginTop: -4}}>
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
         {/* Soft, blurred drop shadow under each black key — a radial fade (dark contact
             point → transparent) so it reads as a subtle depth cue, not a hard band.
             Shared component → applies to the progression grid too. */}
         <Defs>
           <RadialGradient id="miniKeyShadow" cx="50%" cy="50%" r="50%">
             <Stop offset="0" stopColor="#000" stopOpacity={0.38} />
             <Stop offset="1" stopColor="#000" stopOpacity={0} />
           </RadialGradient>
           {/* Side shadows: darkest at the black key's edge, fading out onto the white key beside it,
               so each accidental reads as raised and distinct from the white below. Kept subtle. */}
           <LinearGradient id="bkShadeL" x1="0" y1="0" x2="1" y2="0">
             <Stop offset="0" stopColor="#000" stopOpacity={0} />
             <Stop offset="1" stopColor="#000" stopOpacity={0.16} />
           </LinearGradient>
           <LinearGradient id="bkShadeR" x1="0" y1="0" x2="1" y2="0">
             <Stop offset="0" stopColor="#000" stopOpacity={0.16} />
             <Stop offset="1" stopColor="#000" stopOpacity={0} />
           </LinearGradient>
         </Defs>
         {blackKeys.map(k => (
           <Ellipse key={`bks-${k.midi}`} cx={k.x + BLACK_WIDTH / 2} cy={BLACK_HEIGHT - 0.5} rx={BLACK_WIDTH * 0.6} ry={2} fill="url(#miniKeyShadow)" />
         ))}
         {/* Thin left/right drop shadows cast onto the neighbouring white keys. */}
         {blackKeys.map(k => (
           <Rect key={`bksl-${k.midi}`} x={k.x - 1.6} y={0} width={1.6} height={BLACK_HEIGHT} fill="url(#bkShadeL)" />
         ))}
         {blackKeys.map(k => (
           <Rect key={`bksr-${k.midi}`} x={k.x + BLACK_WIDTH} y={0} width={1.6} height={BLACK_HEIGHT} fill="url(#bkShadeR)" />
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
         {/* Overall border — white frame in dark themes so the piano reads as a white block */}
         <Rect
           x={0} y={0}
           width={SVG_W} height={SVG_H}
           fill="none"
           stroke={isDark ? theme.border : '#000'}
           strokeWidth={1.5}
           rx={1}
         />
         {showLabels && whiteKeys.filter(k => k.active && k.label).map(k => (
           <SvgText key={`wl-${k.midi}`} x={k.x + WHITE_WIDTH / 2} y={WHITE_HEIGHT - 5} fill="#fff" fontSize={5} fontWeight="bold" textAnchor="middle" fontFamily={svgFont}>{k.label}</SvgText>
         ))}
         {showLabels && blackKeys.filter(k => k.active && k.label).map(k => (
           <SvgText key={`bl-${k.midi}`} x={k.x + BLACK_WIDTH / 2} y={BLACK_HEIGHT - 4} fill="#fff" fontSize={5} fontWeight="bold" textAnchor="middle" fontFamily={svgFont}>{k.label}</SvgText>
         ))}
      </Svg>
    </View>
  );
});

export default MiniPianoDiagram;