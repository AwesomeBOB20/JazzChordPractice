import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Line, Circle, Text as SvgText } from 'react-native-svg';
import { ROLE_COLORS_GLOBAL, getNoteColor } from '@shared/ui/themes';
import { useSettingsStore } from '@features/settings/store/settingsStore';

interface Props {
  voicing?: any;
  shape?: any;
  theme: any;
  isMasked?: boolean;
}

function MiniChordDiagram({ voicing, shape, theme, isMasked }: Props) {
  const colorMode = useSettingsStore((s: any) => s.colorMode);
  const selectiveRoles = useSettingsStore((s: any) => s.selectiveRoles);

  if (!voicing && !shape) {
    return (
      <View style={{ height: 40, justifyContent: 'center' }}>
        <Text style={{ color: theme.txt3, fontSize: 9 }}>No Shape</Text>
      </View>
    );
  }

  let activeFrets: number[] = [];
  if (shape && shape.notes) {
    activeFrets = shape.notes.map((n: any) => n.fret).filter((f: number) => f !== null && f > 0);
  } else if (voicing && voicing.frets) {
    activeFrets = voicing.frets.map((f: any) => f?.fret).filter((f: any) => f !== null && f > 0);
  }

  const minF = activeFrets.length ? Math.min(...activeFrets) : 1;
  const maxF = activeFrets.length ? Math.max(...activeFrets) : 4;
  
  let startF = minF <= 1 ? 0 : minF - 1;
  if (maxF <= 4) {
    startF = 0;
  }
  
  const numFrets = Math.max(4, maxF - startF);

  const W = 46; 
  const H = 46 + (numFrets > 4 ? (numFrets - 4) * 10 : 0); 
  const strSpc = W / 5;
  const fretSpc = H / numFrets;
  const dotR = 4;
  const topY = 8; // Extra space at the top for X and O labels

  return (
    // Changed marginTop from 4 to 0 (You can even use -4 here if you want it super tight!)
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 2, marginTop: -4 }}>
      {startF > 0 && (
        <Text style={{ color: theme.txt2, fontSize: 9, fontWeight: '800', marginTop: topY - 2, transform: [{ translateX: -3 }] }}>
          {startF + 1}
        </Text>
      )}
      <Svg key={`svg-${numFrets}-${startF}`} width={W + dotR*2} height={H + dotR*2 + topY} style={{ marginLeft: -dotR, marginTop: -dotR }}>
        {Array.from({ length: numFrets + 1 }).map((_, i) => (
          <Line 
            key={`f-${i}`} 
            x1={dotR} y1={topY + dotR + i * fretSpc} 
            x2={dotR + W} y2={topY + dotR + i * fretSpc} 
            stroke={theme.txt3} 
            strokeWidth={startF === 0 && i === 0 ? 2 : 1} 
          />
        ))}
        {[0,1,2,3,4,5].map(i => (
          <Line 
            key={`s-${i}`} 
            x1={dotR + i * strSpc} y1={topY + dotR} 
            x2={dotR + i * strSpc} y2={topY + dotR + H} 
            stroke={theme.txt3} 
            strokeWidth={1} 
          />
        ))}

        {/* Draw X for strings that have zero notes mapped in the shape */}
        {shape && shape.notes && [0,1,2,3,4,5].map((strIdx) => {
          const hasNotes = shape.notes.some((n: any) => n.stringIdx === strIdx && n.fret !== null);
          if (!hasNotes) {
              return <SvgText key={`mut-s-${strIdx}`} x={dotR + strIdx * strSpc} y={topY - 1} fill={theme.txt3} fontSize={8} textAnchor="middle" fontWeight="bold">X</SvgText>;
          }
          return null;
        })}

        {/* Draw EVERY note in the shape, allowing multiple per string */}
        {shape && shape.notes && shape.notes.map((note: any, i: number) => {
          if (note.fret === null) return null;
          
          let color = theme.accent;
          if (!isMasked && note.role) {
            const roleKey = note.role === '1' ? 'R' : note.role;
            color = getNoteColor(roleKey, colorMode, theme, selectiveRoles);
          }

          if (note.fret === 0) {
            return <Circle key={`shape-open-${i}`} cx={dotR + note.stringIdx * strSpc} cy={topY - 1} r={3.4} fill="transparent" stroke={color} strokeWidth={1.5} />;
          }

          const relFret = note.fret - startF;
          if (relFret < 1 || relFret > numFrets) return null;
          const cx = dotR + note.stringIdx * strSpc;
          const cy = topY + dotR + (relFret - 0.5) * fretSpc;
          
          return <Circle key={`shape-${i}`} cx={cx} cy={cy} r={dotR * 0.85} fill={color} opacity={0.9} />;
        })}

        {!shape && voicing && voicing.frets.map((f: any, i: number) => {
          if (!f || f.fret === null) {
              return <SvgText key={`mut-v-${i}`} x={dotR + i * strSpc} y={topY - 1} fill={theme.txt3} fontSize={8} textAnchor="middle" fontWeight="bold">X</SvgText>;
          }
          
          const color = isMasked 
            ? theme.accent 
            : getNoteColor(f.role === '1' ? 'R' : f.role, colorMode, theme, selectiveRoles);

          if (f.fret === 0) {
            return <Circle key={`v-open-${i}`} cx={dotR + i * strSpc} cy={topY - 1} r={3.4} fill="transparent" stroke={color} strokeWidth={1.5} />;
          }
          
          const relFret = f.fret - startF;
          if (relFret < 1 || relFret > numFrets) return null;
          
          const cx = dotR + i * strSpc;
          const cy = topY + dotR + (relFret - 0.5) * fretSpc;
          
          return <Circle key={`d-${i}`} cx={cx} cy={cy} r={dotR} fill={color} />;
        })}
      </Svg>
    </View>
  );
}

// Memoized: the progression grid re-renders on every measure highlight change, but a
// diagram's inputs (voicing/shape come from memoized arrays, theme is stable) don't
// change then — so this SVG bails out instead of re-rendering for every cell, keeping
// the highlight border switch fast enough to land on the downbeat.
export default React.memo(MiniChordDiagram);